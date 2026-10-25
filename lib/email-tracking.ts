import "server-only";
import { createUntypedAdminClient } from "./reimbursements/supabase/admin";
import { trackEmailBody } from "./email-tracking-links";
import { loadAllPages } from "./reimbursements/load-all-pages";

export type EmailActivity = {
  id: string; kind: string; related_id: string | null; recipient: string; subject: string; body_text: string | null; created_at: string; sent_at: string | null;
  failed_at: string | null; error: string | null;
  events: { kind: "opened" | "clicked"; url: string | null; occurred_at: string }[];
};
type EmailBody = { html: string; text: string; subject: string };
export type TrackingMessage = { key: string; kind: "hosting" | "invite" | "reimbursement"; relatedId?: string; recipient: string };

export function emailTrackingEnabled() {
  return Boolean(process.env.EMAIL_TRACKING_SECRET);
}

export function trackingDb() {
  return createUntypedAdminClient();
}

export function trackingAddress(token: string) {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://admin.cal.taxi").origin;
  const secret = process.env.EMAIL_TRACKING_SECRET;
  if (!secret) throw new Error("Email tracking is not configured. Set EMAIL_TRACKING_SECRET.");
  return { origin, token, secret };
}

function withoutAttachments(body: EmailBody) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== "attachments"));
}

export async function prepareTrackedEmail<T extends EmailBody>(body: T, message: TrackingMessage) {
  if (!emailTrackingEnabled()) return { id: null, body };
  const db = trackingDb();
  trackingAddress("configuration-check");
  const saved = await db.from("email_tracking_messages").upsert({ message_key: message.key, kind: message.kind, related_id: message.relatedId ?? null, recipient: message.recipient, subject: body.subject, body: withoutAttachments(body) }, { onConflict: "message_key", ignoreDuplicates: true });
  if (saved.error) throw new Error("Unable to prepare email tracking. No email was sent.");
  const result = await db.from("email_tracking_messages").select("id,token").eq("message_key", message.key).single();
  if (result.error) throw new Error("Unable to load email tracking. No email was sent.");
  return { id: result.data.id as string, body: trackEmailBody(body, trackingAddress(result.data.token)) as T };
}

export async function recordEmailProvider(id: string | null, providerId: string) {
  if (!id) return;
  const saved = await trackingDb().from("email_tracking_messages").update({ provider_id: providerId, sent_at: new Date().toISOString(), failed_at: null, error: null }).eq("id", id).is("sent_at", null);
  if (saved.error) throw new Error("Email was sent, but its tracking delivery record could not be saved.");
}

export async function recordEmailFailure(id: string | null, error: string) {
  if (!id) return;
  await trackingDb().from("email_tracking_messages").update({ failed_at: new Date().toISOString(), error: error.slice(0, 500) }).eq("id", id).is("sent_at", null);
}

export async function loadUnsentEmail(id: string) {
  const result = await trackingDb().from("email_tracking_messages").select("id,kind,token,message_key,body,sent_at").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Unable to load the email.");
  return result.data as { id: string; kind: TrackingMessage["kind"]; token: string; message_key: string; body: (EmailBody & Record<string, unknown>) | null; sent_at: string | null } | null;
}

export async function recordEmailEvent(token: string, kind: "opened" | "clicked", url: string | null = null) {
  const db = trackingDb();
  const message = await db.from("email_tracking_messages").select("id").eq("token", token).maybeSingle();
  if (message.error) throw new Error("Unable to load email tracking.");
  if (!message.data) return;
  const result = await db.from("email_tracking_events").insert({ message_id: message.data.id, kind, url });
  if (result.error) throw new Error("Unable to record email activity.");
}

function activityQuery() {
  return trackingDb().from("email_tracking_messages").select("id,kind,related_id,recipient,subject,body_text:body->>text,created_at,sent_at,failed_at,error,events:email_tracking_events(kind,url,occurred_at)").or("provider_id.not.is.null,failed_at.not.is.null").order("created_at", { ascending: false });
}

export async function loadReimbursementEmails() {
  const byReimbursement = new Map<string, EmailActivity[]>();
  if (!emailTrackingEnabled()) return byReimbursement;
  const result = await loadAllPages<EmailActivity>((from, to) => activityQuery().eq("kind", "reimbursement").range(from, to));
  if (result.error) throw new Error("Unable to load email activity.");
  for (const message of result.data) {
    byReimbursement.set(message.related_id!, [...byReimbursement.get(message.related_id!) ?? [], message]);
  }
  return byReimbursement;
}

export async function loadEmailActivity(relatedId?: string): Promise<EmailActivity[]> {
  if (!emailTrackingEnabled()) return [];
  let query = activityQuery().limit(100);
  if (relatedId) query = query.eq("related_id", relatedId);
  const result = await query;
  if (result.error) throw new Error("Unable to load email activity.");
  return result.data as EmailActivity[];
}

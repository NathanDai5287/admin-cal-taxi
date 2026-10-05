import "server-only";
import { createClient } from "@supabase/supabase-js";
import { trackEmailBody } from "./email-tracking-links";

export type EmailActivity = {
  id: string; kind: string; related_id: string | null; recipient: string; subject: string; created_at: string; sent_at: string | null;
  events: { kind: "opened" | "clicked"; url: string | null; occurred_at: string }[];
};
type EmailBody = { html: string; text: string; subject: string };
type TrackingMessage = { key: string; kind: "hosting" | "invite"; relatedId?: string; recipient: string };

export function emailTrackingEnabled() {
  return Boolean(process.env.EMAIL_TRACKING_SECRET);
}

export function trackingDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Email tracking database is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function trackingAddress(token: string) {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://admin.cal.taxi").origin;
  const secret = process.env.EMAIL_TRACKING_SECRET;
  if (!secret) throw new Error("Email tracking is not configured. Set EMAIL_TRACKING_SECRET.");
  return { origin, token, secret };
}

export async function prepareTrackedEmail<T extends EmailBody>(body: T, message: TrackingMessage) {
  if (!emailTrackingEnabled()) return { id: null, body };
  const db = trackingDb();
  trackingAddress("configuration-check");
  const saved = await db.from("email_tracking_messages").upsert({ message_key: message.key, kind: message.kind, related_id: message.relatedId ?? null, recipient: message.recipient, subject: body.subject }, { onConflict: "message_key", ignoreDuplicates: true });
  if (saved.error) throw new Error("Unable to prepare email tracking. No email was sent.");
  const result = await db.from("email_tracking_messages").select("id,token").eq("message_key", message.key).single();
  if (result.error) throw new Error("Unable to load email tracking. No email was sent.");
  return { id: result.data.id as string, body: trackEmailBody(body, trackingAddress(result.data.token)) as T };
}

export async function recordEmailProvider(id: string | null, providerId: string) {
  if (!id) return;
  const saved = await trackingDb().from("email_tracking_messages").update({ provider_id: providerId, sent_at: new Date().toISOString() }).eq("id", id).is("sent_at", null);
  if (saved.error) throw new Error("Email was sent, but its tracking delivery record could not be saved.");
}

export async function recordEmailEvent(token: string, kind: "opened" | "clicked", url: string | null = null) {
  const db = trackingDb();
  const message = await db.from("email_tracking_messages").select("id").eq("token", token).maybeSingle();
  if (message.error) throw new Error("Unable to load email tracking.");
  if (!message.data) return;
  const result = await db.from("email_tracking_events").insert({ message_id: message.data.id, kind, url });
  if (result.error) throw new Error("Unable to record email activity.");
}

export async function loadEmailActivity(relatedId?: string): Promise<EmailActivity[]> {
  if (!emailTrackingEnabled()) return [];
  let query = trackingDb().from("email_tracking_messages").select("id,kind,related_id,recipient,subject,created_at,sent_at,events:email_tracking_events(kind,url,occurred_at)").not("provider_id", "is", null).order("created_at", { ascending: false }).limit(100);
  if (relatedId) query = query.eq("related_id", relatedId);
  const result = await query;
  if (result.error) throw new Error("Unable to load email activity.");
  return result.data as EmailActivity[];
}

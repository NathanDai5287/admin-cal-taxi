import "server-only";
import { Resend } from "resend";
import { z } from "zod";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { broadcastSchema, listSchema, renderBroadcast, type Broadcast, type BroadcastInput, type MailingGroup } from "./broadcast";
import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { loadIssue } from "@/lib/nu-news/store";

const idSchema = z.uuid();
const db = () => createAdminClient();
function checked<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("This record changed or was removed. Reload before continuing.");
  return result.data;
}
export async function listGroups() {
  return checked(await db().from("mailing_lists").select("*").order("created_at", { ascending: false }).limit(200)) as unknown as MailingGroup[];
}
export async function listBroadcasts() {
  return checked(await db().from("mailing_broadcasts").select("*").order("created_at", { ascending: false }).limit(100)) as unknown as Broadcast[];
}
export async function broadcastsAreSetUp() {
  const { error } = await db().from("mailing_broadcasts").select("id").limit(0);
  if (error?.code === "PGRST205" || error?.code === "42P01") return false;
  if (error) throw new Error("Broadcasts could not be loaded. Please try again.");
  return true;
}
export async function getBroadcast(id: string) {
  return checked(await db().from("mailing_broadcasts").select("*").eq("id", idSchema.parse(id)).single()) as unknown as Broadcast;
}
export async function saveGroup(input: unknown, id: string, version?: string) {
  const parsed = listSchema.parse(input);
  const recipients = [...new Map(parsed.recipients.map((r) => [r.email, r])).values()];
  const value = { ...parsed, recipients };
  idSchema.parse(id);
  if (version) return checked(await db().from("mailing_lists").update(value).eq("id", id).eq("updated_at", version).select("*").single());
  // A caller-chosen ID makes creation safe to retry without overwriting an existing list.
  const result = await db().from("mailing_lists").insert({ id, ...value }).select("*").single();
  if (result.error?.code === "23505") return checked(await db().from("mailing_lists").select("*").eq("id", id).single());
  return checked(result);
}
export async function saveBroadcast(input: BroadcastInput, id: string, version?: string) {
  const value = broadcastSchema.parse(input);
  idSchema.parse(id);
  if (version) return checked(await db().from("mailing_broadcasts").update(value).eq("id", id).eq("status", "draft").eq("updated_at", version).select("*").single());
  const result = await db().from("mailing_broadcasts").insert({ id, ...value }).select("*").single();
  if (result.error?.code === "23505") return getBroadcast(id);
  return checked(result);
}
async function update(id: string, value: Database["public"]["Tables"]["mailing_broadcasts"]["Update"]) {
  return checked(await db().from("mailing_broadcasts").update(value).eq("id", id).select("*").single()) as unknown as Broadcast;
}
function provider() {
  const key = process.env.RESEND_BROADCAST_API_KEY || process.env.RESEND_API_KEY;
  if (!key) throw new Error("Set RESEND_BROADCAST_API_KEY to a full-access Resend key.");
  return new Resend(key);
}
async function requireSenderTracking(resend: Resend, sender: string) {
  const address = sender.match(/<([^>]+)>/)?.[1] ?? sender;
  if (!z.email().safeParse(address).success) throw new Error("Configure a valid verified broadcast sender.");
  const domainName = address.split("@")[1].toLowerCase();
  const listed = checked(await resend.domains.list());
  const domain = listed.data.find((item) => item.name.toLowerCase() === domainName);
  if (!domain) throw new Error(`Verify ${domainName} in Resend before preparing a broadcast.`);
  const details = checked(await resend.domains.get(domain.id));
  if (details.status !== "verified" || !details.open_tracking || !details.click_tracking) throw new Error(`In Resend, verify ${domainName} and enable its open and click tracking before preparing.`);
}
export function broadcastSender() { return process.env.RESEND_BROADCAST_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || ""; }

export async function prepareBroadcast(id: string, version: string) {
  let row = await getBroadcast(id);
  const resend = provider();
  if (row.status === "draft") {
    if (row.updated_at !== version) throw new Error("The draft changed. Reload and review it first.");
    if (!row.list_id || !row.subject || !row.body || !row.postal_address || !row.reply_to) throw new Error("Choose a list and add a subject, body, reply-to email, and mailing address before preparing.");
    if (row.body.includes("You can read the newsletter using the link below.") && !row.newsletter_id) throw new Error("Choose the finalized newsletter for the link in this email.");
    if (row.newsletter_id) {
      const issue = await loadIssue(row.newsletter_id);
      if (!issue?.finalized_at || !issue.final_pdf_path) throw new Error("Finalize the selected Nu News issue before preparing this email.");
    }
    const sender = broadcastSender();
    if (!sender || sender.includes("resend.dev")) throw new Error("Configure a verified sender in RESEND_BROADCAST_FROM_EMAIL or RESEND_FROM_EMAIL.");
    await requireSenderTracking(resend, sender);
    const group = checked(await db().from("mailing_lists").select("*").eq("id", row.list_id).single()) as unknown as MailingGroup;
    row = checked(await db().from("mailing_broadcasts").update({ status: "preparing", sender, recipient_count: group.recipients.length })
      .eq("id", id).eq("status", "draft").eq("updated_at", version).select("*").single()) as unknown as Broadcast;
    try {
      const segment = checked(await resend.segments.create({ name: `${row.name.slice(0, 50)} ${row.id}` }, { headers: { "Idempotency-Key": `broadcast/${id}/segment` } }));
      row = await update(id, { segment_id: segment.id });
      const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
      const csv = "Email\r\n" + group.recipients.map((r) => quote(r.email)).join("\r\n");
      // Omit subscription fields: importing must never resubscribe an opted-out contact.
      const imported = checked(await resend.contacts.imports.create({ file: new Blob([csv], { type: "text/csv" }),
        columnMap: { email: "Email" }, onConflict: "upsert", segments: [{ id: segment.id }] },
      { headers: { "Idempotency-Key": `broadcast/${id}/import` } }));
      return update(id, { import_id: imported.id });
    } catch (error) {
      await update(id, { status: "review", error: error instanceof Error ? error.message : "Preparation failed. Check Resend before creating a new draft." });
      throw error;
    }
  }
  if (row.status !== "preparing") return row;
  if (!row.import_id || !row.segment_id) throw new Error("Preparation is still starting. Reload in a moment. If it stays here, check Resend before creating a new draft.");
  const imported = checked(await resend.contacts.imports.get(row.import_id));
  if (imported.status === "failed" || imported.counts.failed > 0) return update(id, { status: "review", error: "Some recipients could not be imported. Review the import in Resend before creating another draft." });
  if (imported.status !== "completed") return row;
  // Only one worker may create the remote draft. A crash or ambiguous API error stays in review.
  checked(await db().from("mailing_broadcasts").update({ status: "review", error: "Preparing the Resend draft. If this persists, check Resend before creating another draft." })
    .eq("id", id).eq("status", "preparing").eq("updated_at", row.updated_at).select("id").single());
  try {
    if (row.newsletter_id) await publishNewsletter(row.newsletter_id);
    const remote = checked(await resend.broadcasts.create({ name: row.name, segmentId: row.segment_id, from: row.sender, subject: row.subject,
      html: renderBroadcast(row), ...(row.reply_to ? { replyTo: row.reply_to } : {}), send: false }, { headers: { "Idempotency-Key": `broadcast/${id}/draft` } }));
    return update(id, { resend_id: remote.id, status: "ready", error: null });
  } catch (error) {
    await update(id, { error: "The Resend draft could not be verified. Check Resend before creating another draft." });
    throw error;
  }
}

export async function publishNewsletter(issueId: string) {
  const issue = await loadIssue(idSchema.parse(issueId));
  if (!issue?.finalized_at || !issue.final_pdf_path) throw new Error("Finalize this Nu News issue before publishing its public link.");
  checked(await db().from("nu_news_publications").upsert({ issue_id: issueId }, { onConflict: "issue_id", ignoreDuplicates: true }).select("issue_id"));
  return { issueId, url: `https://cal.taxi/news/${issueId}` };
}

export async function sendBroadcast(id: string, version: string, confirm: boolean) {
  if (confirm !== true) throw new Error("Review the saved message and recipient count, then explicitly confirm sending.");
  const row = await getBroadcast(id);
  if (row.status === "sent") return row;
  if (row.status !== "ready" || row.updated_at !== version || !row.resend_id) throw new Error("Reload and review the prepared broadcast before sending.");
  const resend = provider();
  const remote = checked(await resend.broadcasts.get(row.resend_id));
  if (remote.status !== "draft") throw new Error("This broadcast was already queued or sent in Resend. Check its status instead of sending again.");
  if (remote.html !== renderBroadcast(row) || remote.subject !== row.subject || remote.from !== row.sender || remote.segment_id !== row.segment_id
    || (remote.reply_to ?? []).join(",") !== row.reply_to) throw new Error("The Resend draft differs from this preview. Review it in Resend before sending.");
  // Claim before the external call. An ambiguous failure stays in review and is never resent automatically.
  checked(await db().from("mailing_broadcasts").update({ status: "sending" }).eq("id", id).eq("status", "ready").eq("updated_at", version).select("id").single());
  try {
    checked(await resend.broadcasts.send(row.resend_id));
  } catch (error) {
    await update(id, { status: "review", error: "Send status is uncertain. Check this broadcast in Resend; do not send a replacement until verified." });
    throw error;
  }
  return update(id, { status: "sent", error: null });
}

export async function refreshBroadcast(id: string) {
  const row = await getBroadcast(id);
  if (!row.resend_id || !["ready", "sending", "review"].includes(row.status)) return row;
  const remote = checked(await provider().broadcasts.get(row.resend_id));
  if (remote.status === "sent" || remote.status === "queued") return update(id, { status: "sent", error: null });
  return row;
}

import { z } from "zod";

export const SUBJECT_IDEAS = ["The Latest from Theta Xi", "A Note from Cal Theta Xi", "Inside the Chapter: Theta Xi Updates", "What’s New at Theta Xi", "Theta Xi at Berkeley: News & Updates"];
export const recipientSchema = z.object({ email: z.email().max(254).transform((s) => s.toLowerCase()), first_name: z.string().max(100).default(""), last_name: z.string().max(100).default("") });
export type Recipient = z.infer<typeof recipientSchema>;
export const listSchema = z.object({ name: z.string().trim().min(1).max(100), recipients: z.array(recipientSchema).min(1).max(10_000) });
export const broadcastSchema = z.object({
  name: z.string().trim().min(1).max(100), list_id: z.uuid().nullable(), subject: z.string().trim().max(200).refine((s) => !/[\r\n]/.test(s), "Use one line for the subject."),
  body: z.string().trim().max(50_000), reply_to: z.union([z.email(), z.literal("")]), postal_address: z.string().trim().max(500),
  newsletter_id: z.uuid().nullable(),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;
export type MailingGroup = { id: string; name: string; recipients: Recipient[]; updated_at: string };
export type Broadcast = BroadcastInput & { id: string; status: "draft" | "preparing" | "ready" | "sending" | "sent" | "review"; updated_at: string; created_at: string; finalized_at: string | null; segment_id: string | null; import_id: string | null; resend_id: string | null; recipient_count: number; sender: string; error: string | null };

// Plain addresses, display-name addresses, or spreadsheet rows containing an email.
// Reject an entire line when it contains unrecognized address-like text; never silently drop it.
export function parseRecipients(source: string) {
  if (new TextEncoder().encode(source).length > 2 * 1024 * 1024) throw new Error("Paste up to 2 MB of text.");
  const recipients: Recipient[] = [], invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const entry of source.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    if (/^(email|email address)$/i.test(entry)) continue;
    const matches = entry.match(/[^\s<>"(),;]+@[^\s<>"(),;]+/g) ?? [];
    if (!matches.length) { invalid.push(entry); continue; }
    for (const email of matches) {
      const result = recipientSchema.safeParse({ email });
      if (!result.success) invalid.push(entry);
      else if (seen.has(result.data.email)) duplicates++;
      else { seen.add(result.data.email); recipients.push(result.data); }
    }
  }
  if (recipients.length > 10_000) throw new Error("Use up to 10,000 recipients per list.");
  return { recipients, invalid, duplicates };
}

export const escapeEmail = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const newsletterUrl = (id: string) => `https://cal.taxi/news/${id}`;
export function renderBroadcast(input: Pick<BroadcastInput, "body" | "postal_address"> & { newsletter_id?: string | null; id?: string }) {
  const body = escapeEmail(input.body).replace(/https?:\/\/[^\s<>]+/g, (url) => `<a href="${url}">${url}</a>`).replace(/\n/g, "<br>");
  const source = input.id ? `?broadcast=${z.uuid().parse(input.id)}` : "";
  const newsletter = input.newsletter_id ? `<p style="margin:32px 0"><a href="${newsletterUrl(z.uuid().parse(input.newsletter_id))}${source}" style="display:inline-block;padding:16px 24px;background:#075985;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none">Read Nu News &rarr;</a></p><p style="font-size:13px;color:#606066">Read online or download the PDF. No sign-in needed.</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;color:#101014;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 24px;background:white"><p style="font-size:18px;font-weight:bold;color:#075985">Theta Xi · Nu Chapter</p><div style="font-size:16px;line-height:1.7;overflow-wrap:anywhere;white-space:pre-wrap">${body}</div>${newsletter}<hr style="border:0;border-top:1px solid #d8d8db;margin:32px 0"><p style="font-size:12px;line-height:1.6;color:#606066">${escapeEmail(input.postal_address).replace(/\n/g, "<br>")}<br><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p></div></body></html>`;
}

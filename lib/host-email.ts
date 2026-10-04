import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { backendKey, backendOrigin } from "./host-backend";
import { getOrderFresh } from "./host-orders";
import { listSigning, signingFile, syncSigning, type SigningRevision } from "./host-signing";
import { currentRevision, contractWasSent, eventToday, type EmailKind } from "./host-event";
import { hostingEmail } from "./host-email-template";
import { loadWorkflow, registerSigning, ensureHostingForecast, workflowDb } from "./host-workflow";
import { createAdminClient } from "./reimbursements/supabase/admin";
import { defaultDocuments } from "./host-order-documents";
import type { Order } from "./host-orders-types";

type Attachment = { filename: string; content: string };
type MessageBody = { from: string; to: string[]; reply_to: string; subject: string; html: string; text: string; attachments: Attachment[] };
type FrozenEmail = { body: MessageBody; orderVersion: string; termsHash: string; revisionId: string; paymentsHash: string; refund?: { amount: number; date: string; method: string } };
type DeliveryRow = { id: string; order_id: string; revision_id: string; kind: EmailKind; recipient: string; status: string; payload: FrozenEmail; created_at: string; attempted_at: string | null };
export type EmailPreview = { id: string; recipient: string; subject: string; html: string; attachments: string[]; status: string };
export type EmailRequest = { orderId: string; revisionId: string; expectedUpdatedAt: string; kind: EmailKind; recipients?: string[]; refund?: { amount: number; date: string; method: string } };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const termsHash = (order: Order) => hash({ clubName: order.clubName, eventDate: order.eventDate, rentalPrice: order.rentalPrice, depositAmount: order.depositAmount, snapshot: order.snapshot });
export function hostEmailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.HOST_EMAIL_REPLY_TO;
}
function config() {
  if (!hostEmailConfigured()) throw new Error("Hosting email is not configured yet.");
  return { from: process.env.HOST_EMAIL_FROM || "Theta Xi Hosting <host@cal.taxi>", replyTo: process.env.HOST_EMAIL_REPLY_TO!.trim() };
}
async function context(orderId: string, revisionId: string, refresh: boolean) {
  const [order, revisions, workflow] = await Promise.all([getOrderFresh(orderId), listSigning(orderId), loadWorkflow(orderId)]);
  if (!order) throw new Error("Order not found.");
  let revision = currentRevision(revisions);
  if (!revision || revision.id !== revisionId) throw new Error("The current signing revision changed. Reload this order.");
  if (refresh && revision.envelope_id) {
    await syncSigning(orderId, revision.id);
    revision = currentRevision(await listSigning(orderId));
    if (!revision || revision.id !== revisionId) throw new Error("The current signing revision changed. Reload this order.");
  }
  if (workflow.cancelledAt || order.statusOverride === "cancelled") throw new Error("This event is cancelled. Email sending is disabled.");
  await registerSigning(revision);
  return { order, revision, workflow };
}
async function rentalPayments(orderId: string) {
  const result = await createAdminClient().from("hosting_finance_payments").select("id,amount,paid_date").eq("order_id", orderId).eq("kind", "revenue").is("reversed_at", null).order("id");
  if (result.error) throw new Error("Unable to verify recorded rental payments.");
  const rows = result.data ?? [];
  return { rows, total: rows.reduce((n, r) => n + Number(r.amount), 0), hash: hash(rows) };
}
async function exactFile(revision: SigningRevision, kind: "original" | "completed" | "audit"): Promise<Attachment> {
  const response = await signingFile(revision.order_id, revision.id, kind);
  return { filename: `hosting-contract-r${revision.revision}-${kind}.pdf`, content: Buffer.from(await response.arrayBuffer()).toString("base64") };
}
async function statementPdf(order: Order, title: string, lines: string[]): Promise<Attachment> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]); let y = 735;
  // Standard-font PDFs explicitly replace unsupported characters rather than
  // crash or silently truncate a receipt. Emails retain the original Unicode.
  const ascii = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
  for (const [i, line] of ["Theta Xi Hosting", title, order.clubName, `Event: ${order.eventDate}`, `Order: ${order.id}`, "", ...lines, "", "Theta Xi - Nu Chapter", "2639 Durant Ave, Berkeley, CA 94704", process.env.HOST_EMAIL_REPLY_TO || ""].entries()) {
    const words = ascii(line).split(/\s+/); let row = "";
    for (const word of words) {
      if (row && font.widthOfTextAtSize(`${row} ${word}`, 11) > 510) { if (y < 55) { page = pdf.addPage([612, 792]); y = 735; } page.drawText(row, { x: 50, y, size: 11, font }); y -= 19; row = word; } else row += (row ? " " : "") + word;
    }
    if (y < 55) { page = pdf.addPage([612, 792]); y = 735; }
    page.drawText(row, { x: 50, y, size: i === 1 ? 20 : 11, font: i < 2 ? bold : font }); y -= i === 1 ? 38 : 22;
  }
  return { filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${order.id}.pdf`, content: Buffer.from(await pdf.save()).toString("base64") };
}
async function invoicePdf(order: Order, kind: "deposit_invoice" | "rental_invoice") {
  const current = order.documents.filter(d => d.kind === kind && !d.stale && d.sourceSnapshot).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  const defaults = defaultDocuments(order, order.documents.find(d => d.kind === "deposit_invoice" && !d.stale)?.number);
  if (!current && defaults.missing[kind].length) throw new Error(`Complete the invoice details first: ${defaults.missing[kind].join(", ")}.`);
  const endpoint = kind === "deposit_invoice" ? "invoice/deposit" : "invoice/rental";
  const response = await fetch(`${backendOrigin()}/api/generate/${endpoint}`, {
    method: "POST", headers: { "X-Admin-Key": backendKey()!, "Content-Type": "application/json" }, body: JSON.stringify(current?.payload ?? defaults.payloads[kind]), cache: "no-store", signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Invoice generation failed. No email was sent.");
  return { filename: `${kind.replaceAll("_", "-")}-${order.id}.pdf`, content: Buffer.from(await response.arrayBuffer()).toString("base64") };
}
function preview(row: DeliveryRow): EmailPreview {
  return { id: row.id, recipient: row.recipient, subject: row.payload.body.subject, html: row.payload.body.html, attachments: row.payload.body.attachments.map(a => a.filename), status: row.status };
}
export async function prepareHostingEmail(input: EmailRequest): Promise<EmailPreview[]> {
  const sender = config();
  // Preview uses archived state; delivery still synchronizes Documenso and
  // checks current terms, payments and recipients immediately before sending.
  const { order, revision, workflow } = await context(input.orderId, input.revisionId, false);
  if (order.updatedAt !== input.expectedUpdatedAt) throw new Error("Order details changed. Reload before preparing an email.");
  const signing = input.kind === "invitation" || input.kind === "reminder";
  if (signing && revision.state !== "awaiting_signatures") throw new Error("This contract no longer needs signatures.");
  if (input.kind !== "invitation" && !contractWasSent(revision, workflow)) throw new Error("Send the contract before sending follow-up documents.");
  if (input.kind === "completed" && (revision.state !== "signed" || !revision.files.completed || !revision.files.audit)) throw new Error("The completed contract and audit trail are not ready yet.");
  const savedPeople = order.snapshot.contractSigners as { email?: string }[] | undefined;
  const renterEmails = new Set((Array.isArray(savedPeople) ? savedPeople : []).map(p => p.email?.trim().toLowerCase()).filter(Boolean));
  const eligible = revision.recipients.filter(p => signing ? p.status !== "SIGNED" : input.kind === "completed" || renterEmails.has(p.email.toLowerCase()));
  const selected = input.recipients?.length ? eligible.filter(p => input.recipients!.includes(p.email)) : eligible;
  if (!selected.length) throw new Error("There are no eligible recipients for this email.");
  if (input.recipients?.some(email => !eligible.some(p => p.email === email))) throw new Error("A selected recipient is no longer eligible. Reload signing progress.");
  const payments = input.kind === "receipt" || input.kind === "refund" ? await rentalPayments(order.id) : { rows: [], total: 0, hash: "" };
  if (input.kind === "refund") {
    if (payments.total < (order.rentalPrice ?? Infinity)) throw new Error("Record full rental payment before confirming the deposit return.");
    const refund = input.refund;
    if (!refund || !Number.isFinite(refund.amount) || refund.amount <= 0 || refund.amount > (order.depositAmount ?? 0) || !/^\d{4}-\d{2}-\d{2}$/.test(refund.date) || refund.date > eventToday() || !refund.method.trim() || refund.method.length > 120) throw new Error("Enter the amount, date, and method of the deposit you actually returned.");
    if (workflow.refund && hash(workflow.refund) !== hash(refund)) throw new Error("A different deposit return was already confirmed. Check the existing record before sending.");
  }
  const suffix = input.kind === "reminder" ? eventToday() : ["invitation", "completed"].includes(input.kind) ? "once" : hash({ terms: termsHash(order), kind: input.kind, payments: input.kind === "receipt" || input.kind === "refund" ? payments.hash : "", refund: input.refund });
  const requestKey = (email: string) => hash([order.id, revision.id, input.kind, email.toLowerCase(), suffix]);
  const keys = selected.map(person => requestKey(person.email));
  const db = workflowDb();
  const existing = await db.from("hosting_email_deliveries").select("*").eq("order_id", order.id).in("request_key", keys);
  if (existing.error) throw new Error("Unable to load saved previews.");
  const saved = (existing.data ?? []) as DeliveryRow[];
  if (saved.length === selected.length) return selected.map(person => preview(saved.find(row => row.recipient === person.email)!));
  const money = (n: number) => `$${n.toFixed(2)}`;
  let attachments: Attachment[] = []; let detail = "";
  if (input.kind === "invitation") attachments = [await exactFile(revision, "original")];
  if (input.kind === "completed") attachments = await Promise.all([exactFile(revision, "completed"), exactFile(revision, "audit")]);
  if (input.kind === "deposit_invoice" || input.kind === "rental_invoice") attachments = [await invoicePdf(order, input.kind)];
  if (input.kind === "receipt") {
    if (payments.total <= 0) throw new Error("Record a rental payment before sending a receipt.");
    detail = `Rental payments received: ${money(payments.total)}. Remaining rental fee: ${money(Math.max((order.rentalPrice ?? 0) - payments.total, 0))}.`;
    attachments = [await statementPdf(order, "Rental payment receipt", [detail, ...payments.rows.map(r => `${r.paid_date}: ${money(Number(r.amount))} (record ${r.id})`), "This receipt covers the recorded rental payments listed above. The refundable deposit is separate."])];
  }
  if (input.kind === "refund") {
    const refund = input.refund!;
    detail = `Deposit returned: ${money(refund.amount)} on ${refund.date} via ${refund.method}.`;
    attachments = [await statementPdf(order, "Deposit return confirmation", [detail, `Original refundable deposit: ${money(order.depositAmount ?? 0)}.`, "Return information recorded by the hosting administrator."])];
  }
  const pending = selected.filter(person => !saved.some(row => row.recipient === person.email)).map(person => {
    const message = hostingEmail({ kind: input.kind, name: person.name, organization: order.clubName, eventDate: order.eventDate, link: person.link, detail, replyTo: sender.replyTo });
    const body: MessageBody = { from: sender.from, to: [person.email], reply_to: sender.replyTo, ...message, attachments };
    const payload: FrozenEmail = { body, orderVersion: order.updatedAt, termsHash: termsHash(order), revisionId: revision.id, paymentsHash: payments.hash, ...(input.refund ? { refund: input.refund } : {}) };
    return { request_key: requestKey(person.email), order_id: order.id, revision_id: revision.id, kind: input.kind, recipient: person.email, payload };
  });
  const inserted = await db.from("hosting_email_deliveries").upsert(pending, { onConflict: "request_key", ignoreDuplicates: true });
  if (inserted.error) throw new Error("Unable to save the email preview. No email was sent.");
  const rows = await db.from("hosting_email_deliveries").select("*").eq("order_id", order.id).in("request_key", keys);
  if (rows.error || rows.data?.length !== selected.length) throw new Error("Unable to load the email preview.");
  return selected.map(person => preview((rows.data as DeliveryRow[]).find(row => row.recipient === person.email)!));
}
export async function deliverHostingEmails(orderId: string, ids: string[]) {
  if (!hostEmailConfigured()) throw new Error("Hosting email is not configured.");
  if (!ids.length || ids.length > 40 || new Set(ids).size !== ids.length) throw new Error("Choose a valid email preview.");
  const db = workflowDb();
  const query = await db.from("hosting_email_deliveries").select("*").eq("order_id", orderId).in("id", ids);
  if (query.error || query.data?.length !== ids.length) throw new Error("This email preview is no longer available.");
  const rows = query.data as DeliveryRow[];
  const revisionId = rows[0].revision_id;
  if (rows.some(r => r.revision_id !== revisionId || r.kind !== rows[0].kind)) throw new Error("Choose emails from one preview.");
  const { order, revision } = await context(orderId, revisionId, true);
  const payments = await rentalPayments(orderId);
  let sent = 0; let skipped = 0; const errors: string[] = [];
  for (const row of rows) {
    if (row.status === "sent") { sent++; continue; }
    if (row.payload.termsHash !== termsHash(order)) { errors.push("Order terms changed. Prepare a fresh preview."); continue; }
    if ((row.kind === "receipt" || row.kind === "refund") && row.payload.paymentsHash !== payments.hash) { errors.push("Payment records changed. Prepare a fresh preview."); continue; }
    if ((row.kind === "invitation" || row.kind === "reminder") && (revision.state !== "awaiting_signatures" || revision.recipients.find(p => p.email === row.recipient)?.status === "SIGNED")) { skipped++; continue; }
    // Recheck cancellation immediately before each delivery, including batch retries.
    if ((await loadWorkflow(orderId)).cancelledAt) { errors.push("Event cancelled; remaining emails were not sent."); break; }
    const claim = await db.rpc("claim_hosting_email", { p_id: row.id });
    if (claim.error) throw new Error("Could not reserve email delivery. Retry shortly.");
    if (!claim.data) { errors.push("This email is already sending or needs review in Resend. Reload its delivery history."); continue; }
    if (row.kind === "refund" && row.payload.refund) {
      const refund = row.payload.refund;
      const saved = await db.from("hosting_event_state").upsert({ order_id: orderId, refund_amount: refund.amount, refund_date: refund.date, refund_method: refund.method }, { onConflict: "order_id" });
      if (saved.error) throw new Error("Unable to save the deposit return record.");
    }
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `hosting/${row.id}` }, body: JSON.stringify(row.payload.body), signal: AbortSignal.timeout(25_000),
      });
      const answer = await response.json() as { id?: string; message?: string };
      if (!response.ok || !answer.id) throw new Error(answer.message || `Email service returned ${response.status}.`);
      const saved = await db.from("hosting_email_deliveries").update({ status: "sent", provider_id: answer.id, sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      if (saved.error) throw new Error("Email accepted; delivery history could not be saved. Retry uses the same email key.");
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed.";
      await db.from("hosting_email_deliveries").update({ status: "failed", error: message.slice(0, 500) }).eq("id", row.id);
      errors.push(`${row.recipient}: ${message}`);
    }
    // Stay within the free plan's API rate limit. Each recipient is private.
    if (rows.length > 1) await new Promise(resolve => setTimeout(resolve, 550));
  }
  if (sent > 0) {
    try { await ensureHostingForecast(order); } catch (e) { errors.push(e instanceof Error ? e.message : "Forecast update failed."); }
  }
  return { sent, skipped, errors };
}
export async function sendCompletedContract(orderId: string, revisionId: string) {
  if (!hostEmailConfigured()) return;
  const revision = currentRevision(await listSigning(orderId));
  if (revision?.id !== revisionId || revision.state !== "signed" || !revision.files.completed || !revision.files.audit) return;
  const order = await getOrderFresh(orderId); if (!order) return;
  const workflow = await loadWorkflow(orderId);
  if (workflow.cancelledAt || order.statusOverride === "cancelled") return;
  const recipients = revision.recipients.filter(p => !workflow.deliveries.some(d => d.kind === "completed" && d.revision_id === revision.id && d.recipient === p.email && d.status === "sent")).map(p => p.email);
  if (!recipients.length) return;
  const previews = await prepareHostingEmail({ orderId, revisionId, expectedUpdatedAt: order.updatedAt, kind: "completed", recipients });
  const result = await deliverHostingEmails(orderId, previews.map(p => p.id));
  if (result.errors.length) throw new Error("Completed contract email needs retry.");
}

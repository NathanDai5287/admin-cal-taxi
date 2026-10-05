import { read, write } from "./data";
import { hostingEmailDraft } from "../../lib/host-email-draft";
import { recordHostingPaymentAction } from "./orders-actions";
import type { EmailRequest, EmailPreview } from "../../lib/host-email";
import type { EventWorkflow } from "../../lib/host-event";
const key = "host.timeline.preview.v1";
export async function recordHostingDepositAction(input: { orderId: string; amount: number; paidDate: string; requestId: string }) { return recordHostingPaymentAction({ ...input, kind: "deposit" }); }
export async function undoHostingDepositAction(input: { orderId: string; paymentIds: string[] }) {
  const data = read();
  for (const payment of data.finance[input.orderId]?.payments ?? []) if (payment.kind === "deposit" && input.paymentIds.includes(payment.id) && !payment.reversedAt) payment.reversedAt = new Date().toISOString();
  write(data); return { ok: true as const, data: null };
}
export function previewWorkflow(orderId: string): EventWorkflow {
  return JSON.parse(localStorage.getItem(`${key}.${orderId}`) ?? '{"activatedAt":"2026-10-04T12:00:00Z","cancelledAt":null,"deliveries":[],"refund":null}');
}
function save(orderId: string, workflow: EventWorkflow) { localStorage.setItem(`${key}.${orderId}`, JSON.stringify(workflow)); window.dispatchEvent(new Event("preview-data")); }
export async function refreshHostingProgressAction() { return { ok: true as const }; }
export async function previewHostingEmailAction(input: EmailRequest) {
  const data = read(); const order = data.orders.find(o => o.id === input.orderId)!;
  const revision = data.revisions[input.orderId].find(r => r.id === input.revisionId)!;
  const payments = data.finance[input.orderId]?.payments.filter(p => !p.reversedAt) ?? [];
  const total = (kind: "revenue" | "deposit") => payments.filter(p => p.kind === kind).reduce((n,p) => n+p.amount,0);
  const result: EmailPreview[] = hostingEmailDraft(order, revision, input.kind, total("revenue"), "nathan.dai@berkeley.edu", input.refund, total("deposit"))
    .filter(p => p.recipient.includes(", ") || !input.recipients?.length || input.recipients.includes(p.recipient))
    .map(p => ({ ...p, id: crypto.randomUUID(), attachments: input.kind === "reminder" ? [] : ["illustrative-document.pdf"], status: "queued" }));
  const workflow = previewWorkflow(order.id); for (const row of result) workflow.deliveries.unshift({ id: row.id, revision_id: revision.id, kind: input.kind, recipient: row.recipient, status: "queued", sent_at: null, created_at: new Date().toISOString(), error: null });
  save(order.id, workflow); return { ok: true as const, data: result };
}
export async function sendHostingEmailAction(orderId: string, ids: string[]) {
  const workflow = previewWorkflow(orderId); workflow.deliveries.forEach(d => { if (ids.includes(d.id)) { d.status = "sent"; d.sent_at = new Date().toISOString(); } }); save(orderId, workflow);
  return { ok: true as const, data: { sent: ids.length, skipped: 0, errors: [] as string[] } };
}
export async function cancelHostingEventAction(orderId: string) { const workflow = previewWorkflow(orderId); workflow.cancelledAt = new Date().toISOString(); save(orderId, workflow); const data = read(); data.finance[orderId].included = false; write(data); return { ok: true as const }; }
export async function copyHostingSigningLinkAction(orderId: string, revisionId: string, email: string) { return { ok: true as const, data: read().revisions[orderId].find(r => r.id === revisionId)!.recipients.find(p => p.email === email)!.link }; }

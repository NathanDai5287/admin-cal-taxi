import { read, write } from "./data";
import { hostingEmail } from "../../lib/host-email-template";
import type { EmailRequest, EmailPreview } from "../../lib/host-email";
import type { EventWorkflow } from "../../lib/host-event";
const key = "host.timeline.preview.v1";
export function previewWorkflow(orderId: string): EventWorkflow {
  return JSON.parse(localStorage.getItem(`${key}.${orderId}`) ?? '{"activatedAt":"2026-10-04T12:00:00Z","cancelledAt":null,"deliveries":[],"refund":null}');
}
function save(orderId: string, workflow: EventWorkflow) { localStorage.setItem(`${key}.${orderId}`, JSON.stringify(workflow)); window.dispatchEvent(new Event("preview-data")); }
export async function refreshHostingProgressAction() { return { ok: true as const }; }
export async function previewHostingEmailAction(input: EmailRequest) {
  const data = read(); const order = data.orders.find(o => o.id === input.orderId)!;
  const revision = data.revisions[input.orderId].find(r => r.id === input.revisionId)!;
  const people = revision.recipients.filter(p => (!input.recipients?.length || input.recipients.includes(p.email)) && (input.kind !== "reminder" || p.status !== "SIGNED"));
  const result: EmailPreview[] = people.map(person => ({ id: crypto.randomUUID(), recipient: person.email, ...hostingEmail({ kind: input.kind, name: person.name, organization: order.clubName, eventDate: order.eventDate, link: `https://example.test/sign/${person.id}`, replyTo: "nathan.dai@berkeley.edu" }), attachments: input.kind === "reminder" ? [] : ["illustrative-document.pdf"], status: "queued" }));
  const workflow = previewWorkflow(order.id); for (const row of result) workflow.deliveries.unshift({ id: row.id, revision_id: revision.id, kind: input.kind, recipient: row.recipient, status: "queued", sent_at: null, created_at: new Date().toISOString(), error: null });
  save(order.id, workflow); return { ok: true as const, data: result };
}
export async function sendHostingEmailAction(orderId: string, ids: string[]) {
  const workflow = previewWorkflow(orderId); workflow.deliveries.forEach(d => { if (ids.includes(d.id)) { d.status = "sent"; d.sent_at = new Date().toISOString(); } }); save(orderId, workflow);
  return { ok: true as const, data: { sent: ids.length, skipped: 0, errors: [] as string[] } };
}
export async function cancelHostingEventAction(orderId: string) { const workflow = previewWorkflow(orderId); workflow.cancelledAt = new Date().toISOString(); save(orderId, workflow); const data = read(); data.finance[orderId].included = false; write(data); return { ok: true as const }; }
export async function copyHostingSigningLinkAction(orderId: string, revisionId: string, email: string) { return { ok: true as const, data: read().revisions[orderId].find(r => r.id === revisionId)!.recipients.find(p => p.email === email)!.link }; }

import { read, write } from "./data";
import type { SigningActivation, SigningRevision } from "../../lib/host-signing";

export async function listSigningAction(id: string) { return read().revisions[id] ?? []; }
export async function prepareSigningAction(orderId: string, payload: any, _key: string, expectedLatest: string) {
  const data = read(); const rows = data.revisions[orderId] ?? [];
  if ((rows[0]?.id ?? "") !== expectedLatest) throw new Error("Signing history changed. Reload the sample order.");
  const revision: SigningRevision = { id: `sig_local_${crypto.randomUUID().slice(0, 8)}`, order_id: orderId, revision: (rows[0]?.revision ?? 0) + 1, state: "preview", original_sha256: "local-preview", envelope_id: null, signedCount: 0, totalCount: payload.signers?.length ?? 0, files: { original: true, completed: false, audit: false }, error: null, created_at: new Date().toISOString(),
    recipients: (payload.signers ?? []).map((person: any, index: number) => ({ id: index + 1, name: person.fullName, email: person.email, status: "NOT_SIGNED", link: "" })) };
  data.revisions[orderId] = [revision, ...rows]; write(data); return revision;
}
export async function createSigningLinksAction(orderId: string, id: string, _hash: string, activation: SigningActivation) {
  const data = read(); const rows = data.revisions[orderId] ?? []; const revision = rows.find(row => row.id === id);
  if (!revision || rows[0]?.id !== id) throw new Error("The preview has been replaced.");
  if (revision.state === "awaiting_signatures") return revision;
  const order = data.orders.find(order => order.id === orderId); if (!order || activation.expectedUpdatedAt !== order.updatedAt) throw new Error("Order changed. Review again.");
  const pending = rows.filter(row => row.id !== id && row.state === "awaiting_signatures");
  if (JSON.stringify(pending.map(row => row.id).sort()) !== JSON.stringify([...activation.replacesRevisionIds].sort())) throw new Error("Review outstanding links again.");
  pending.forEach(row => { row.state = "cancelled"; });
  Object.assign(order, { clubName: activation.clubName, eventDate: activation.eventDate, rentalPrice: activation.rentalPrice, depositAmount: activation.depositAmount, snapshot: activation.snapshot, updatedAt: new Date().toISOString() });
  revision.state = "awaiting_signatures"; revision.envelope_id = "local-envelope";
  revision.recipients.forEach((person, index) => { person.link = `${location.origin}/preview-sign/${revision.id}/${index}`; person.copyToken = `local-copy-${revision.id}-${index}`; });
  write(data); return revision;
}
export async function syncSigningAction(orderId: string, id: string) { const row = read().revisions[orderId]?.find(row => row.id === id); if (!row) throw new Error("Sample revision not found."); return row; }
export const reconcileSigningAction = syncSigningAction;
export async function markSigningLinkSentAction(orderId: string, id: string, email: string, sent: boolean) {
  const data = read(); const row = data.revisions[orderId]?.find(row => row.id === id); if (!row) throw new Error("Sample revision not found.");
  const person = row.recipients.find(person => person.email === email); if (person) person.sentAt = sent ? new Date().toISOString() : null;
  write(data); return row;
}

import { read, write } from "./data";
import type { Order, OrderDocument, OrderStatus } from "../../lib/host-orders-types";
const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });
export async function getOrderAction(id: string) { const order = read().orders.find(order => order.id === id); return order ? ok(order) : fail("Local sample order not found."); }
export async function saveOrderAction(input: any) {
  const data = read();
  const existing = data.orders.find(order => order.snapshot.localRequestKey === input.requestKey);
  if (existing) return ok(existing);
  const stamp = new Date().toISOString();
  const order: Order = { ...input, id: `ord_local_${crypto.randomUUID().slice(0, 8)}`, createdAt: stamp, updatedAt: stamp, notes: "", statusOverride: null };
  order.snapshot.localRequestKey = input.requestKey;
  data.orders.unshift(order); write(data); return ok(order);
}
export async function updateOrderAction(id: string, patch: any) {
  const data = read(); const index = data.orders.findIndex(order => order.id === id);
  if (index < 0) return fail("Local sample order not found.");
  if (patch.expectedUpdatedAt && patch.expectedUpdatedAt !== data.orders[index].updatedAt) return fail("Order changed. Reload before saving.");
  const pending = data.revisions[id]?.some(row => ["awaiting_signatures", "signed", "preparing_completed_copy"].includes(row.state));
  if (pending && patch.snapshot && JSON.stringify(patch.snapshot) !== JSON.stringify(data.orders[index].snapshot)) return fail("Preview and approve a replacement contract to change its terms.");
  data.orders[index] = { ...data.orders[index], ...patch, updatedAt: new Date().toISOString() }; write(data); return ok(data.orders[index]);
}
export async function addDocumentAction(id: string, document: Omit<OrderDocument, "id">) {
  const data = read(); const order = data.orders.find(order => order.id === id); if (!order) return fail("Local order not found.");
  order.documents = [...order.documents.filter(doc => doc.kind !== document.kind), { ...document, id: crypto.randomUUID() }];
  order.updatedAt = new Date().toISOString(); write(data); return ok(order);
}
export async function setOrderStatusAction(id: string, statusOverride: OrderStatus | null) { return updateOrderAction(id, { statusOverride }); }
export async function setOrderNotesAction(id: string, notes: string) { return updateOrderAction(id, { notes }); }
export async function deleteOrderAction(id: string) { const data = read(); data.orders = data.orders.filter(order => order.id !== id); write(data); return ok(null); }
export async function confirmHostingContractAction(id: string) { const data = read(); data.finance[id] ??= { included: false, payments: [] }; data.finance[id].included = true; write(data); return ok(null); }
export async function cancelHostingContractAction(id: string) { const data = read(); data.finance[id] ??= { included: false, payments: [] }; data.finance[id].included = false; write(data); return ok(null); }
export async function recordHostingPaymentAction(input: any) { if (localStorage.getItem("host.preview.fail-payment") === "true") throw new Error("Simulated payment network failure"); const data = read(); data.finance[input.orderId] ??= { included: false, payments: [] }; data.finance[input.orderId].payments.push({ id: crypto.randomUUID(), kind: input.kind, amount: input.amount, paidDate: input.paidDate, reversedAt: null }); write(data); return ok(null); }
export async function reverseHostingPaymentAction(id: string) { if (localStorage.getItem("host.preview.fail-reversal") === "true") throw new Error("Simulated reversal network failure"); const data = read(); for (const finance of Object.values(data.finance)) { const item = finance.payments.find(payment => payment.id === id); if (item) item.reversedAt = new Date().toISOString(); } write(data); return ok(null); }

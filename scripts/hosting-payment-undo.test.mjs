import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const fixture = `
export const state = { allowed: true, writes: 0, error: false, rows: [], paths: [] };
export async function requireAdmin() { if (!state.allowed) throw Error('Not authorized'); return { userId: 'administrator' }; }
export function revalidatePath(path) { state.paths.push(path); }
export function createAdminClient() {
  return { from(table) {
    if (table !== 'hosting_finance_payments') throw Error('Wrong table');
    let patch; const predicates = [];
    const query = {
      update(value) { patch = value; return query; },
      eq(key, value) { predicates.push(row => row[key] === value); return query; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return query; },
      is(key, value) { predicates.push(row => row[key] === value); return query; },
      then(resolve, reject) {
        state.writes++;
        if (state.error) return Promise.resolve({ error: { message: 'Database unavailable' } }).then(resolve, reject);
        state.rows = state.rows.map(row => predicates.every(check => check(row)) ? { ...row, ...patch } : row);
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    }; return query;
  } };
}
export function createClient() { throw Error('Unexpected client'); }
export const addDocument = () => {}, createOrder = () => {}, deleteOrder = () => {}, getOrder = () => {}, getOrderFresh = () => {}, updateOrder = () => {};
export const listSigning = () => {};
`;
const result = await build({
  stdin: { contents: 'export { undoHostingPaymentStatusAction } from "./app/(admin)/host/orders/actions"; export { state } from "undo-fixture";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", alias: { "@": process.cwd() },
  plugins: [{ name: "payment-fixture", setup(build) {
    build.onResolve({ filter: /^(undo-fixture|next\/cache|@\/lib\/host-(orders|signing)$|@\/lib\/reimbursements\/(auth|supabase\/(admin|server))$)/ }, () => ({ path: "fixture", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: fixture }));
  } }],
});
const { undoHostingPaymentStatusAction: undo, state } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
function reset() {
  Object.assign(state, { allowed: true, writes: 0, error: false, paths: [], rows: ids.map((id, index) => ({
    id, order_id: index === 4 ? "other-order" : "order", kind: index === 2 ? "fire_permit" : "revenue",
    amount: index === 0 ? 600 : 800, paid_date: "2026-10-04", reversed_at: index === 3 ? "previous-reversal" : null,
  })) });
}
test("undo reverses an item's active records together and preserves amounts, dates, other items and orders", async () => {
  reset(); const before = structuredClone(state.rows);
  assert.equal((await undo({ orderId: "order", kind: "revenue", paymentIds: ids })).ok, true);
  assert.equal(state.writes, 1);
  for (let i = 0; i < 2; i++) {
    assert.ok(state.rows[i].reversed_at);
    assert.equal(state.rows[i].reversed_by, "administrator");
    assert.equal(state.rows[i].amount, before[i].amount);
    assert.equal(state.rows[i].paid_date, before[i].paid_date);
  }
  assert.deepEqual(state.rows.slice(2), before.slice(2));
  assert.deepEqual(state.paths, ["/host/orders/order", "/finance/planning", "/finance/reports"]);
  const reversed = structuredClone(state.rows);
  await undo({ orderId: "order", kind: "revenue", paymentIds: ids });
  assert.deepEqual(state.rows, reversed);
});
test("permission, invalid selection, and database failures do not alter payments", async () => {
  reset(); const before = structuredClone(state.rows);
  state.allowed = false;
  await assert.rejects(undo({ orderId: "order", kind: "revenue", paymentIds: ids }), /Not authorized/);
  state.allowed = true;
  assert.equal((await undo({ orderId: "order", kind: "revenue", paymentIds: [] })).ok, false);
  assert.equal(state.writes, 0);
  state.error = true;
  assert.equal((await undo({ orderId: "order", kind: "revenue", paymentIds: ids })).ok, false);
  assert.deepEqual(state.rows, before);
  assert.equal(state.paths.length, 0);
});

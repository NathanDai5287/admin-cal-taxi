import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";
import { z } from "zod";

const source = await readFile(new URL("../app/(admin)/host/orders/email-actions.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "cjs" });
const orderId = "ord_return_test";
const today = "2026-10-19";

function depositReturn({ readOnly = false, cancelledAt = null, statusOverride = null, rentalPaid = 1400, eventEndDate = "2026-10-16", timing = "day_before", refund = null, depositReceived = 275 } = {}) {
  const calls = { authorizations: [], tables: [], writes: [], emails: [], invalidations: [] };
  const state = { order_id: orderId, refund_amount: refund?.amount ?? null, refund_date: refund?.date ?? null, refund_method: refund?.method ?? null, cancelled_at: cancelledAt };
  const tables = {
    hosting_deposit_payments: [
      { order_id: orderId, amount: depositReceived - 25, reversed_at: null },
      { order_id: orderId, amount: 25, reversed_at: null },
      { order_id: orderId, amount: 999, reversed_at: today },
      { order_id: "another_order", amount: 999, reversed_at: null },
    ],
    hosting_finance_payments: [
      { order_id: orderId, amount: rentalPaid, kind: "revenue", reversed_at: null },
      { order_id: orderId, amount: 999, kind: "revenue", reversed_at: today },
      { order_id: orderId, amount: 999, kind: "fire_permit", reversed_at: null },
    ],
    hosting_event_state: [state],
  };
  const db = { from(table) {
    assert.ok(table in tables, `Unexpected table: ${table}`);
    calls.tables.push(table);
    const filters = [];
    let update;
    const query = {
      select: () => query,
      eq: (column, value) => { filters.push(row => row[column] === value); return query; },
      is: (column, value) => { filters.push(row => row[column] === value); return query; },
      upsert: async (value) => { calls.writes.push({ table, value }); return { error: null }; },
      update: (value) => { update = value; return query; },
      then(resolve) {
        const rows = tables[table].filter(row => filters.every(matches => matches(row)));
        if (update) rows.forEach(row => Object.assign(row, update));
        if (update) calls.writes.push({ table, value: update });
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  } };
  const rejectEmail = async () => { calls.emails.push("email"); throw new Error("Unexpected email operation"); };
  const modules = {
    zod: { z },
    "next/cache": { revalidatePath: path => calls.invalidations.push(path) },
    "@/lib/reimbursements/auth": { requireAppAccess: async (...args) => {
      calls.authorizations.push(args);
      if (readOnly) throw new Error("Unauthorized");
      return { userId: "user_test" };
    } },
    "@/lib/host-orders": { getOrderFresh: async () => ({ id: orderId, statusOverride, rentalPrice: 1400, depositAmount: 300, snapshot: { rentalPaymentTiming: timing } }) },
    "@/lib/host-event": { eventToday: () => today },
    "@/lib/host-payment-schedule": { orderPaymentSchedule: () => ({ eventEndDate }) },
    "@/lib/host-signing": {},
    "@/lib/host-email": { prepareHostingEmail: rejectEmail, deliverHostingEmails: rejectEmail, sendCompletedContract: rejectEmail },
    "@/lib/host-workflow": {
      workflowDb: () => db,
      loadWorkflow: async () => ({ cancelledAt: state.cancelled_at, refund: state.refund_amount === null ? null : { amount: state.refund_amount, date: state.refund_date, method: state.refund_method } }),
    },
    "@/lib/reimbursements/supabase/admin": { createAdminClient: () => db },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled.code)(name => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }, loaded, loaded.exports);
  return { markReturned: () => loaded.exports.recordHostingDepositReturnAction(orderId), calls, state };
}

test("marking returns all active received deposits today without sending emails or transferring money", async () => {
  const { markReturned, calls, state } = depositReturn();
  assert.deepEqual(await markReturned(), { ok: true, data: { amount: 275, date: today, method: null } });
  assert.deepEqual(calls.authorizations, [["host", "write"]]);
  assert.equal(state.refund_amount, 275);
  assert.deepEqual(calls.writes.map(write => write.table), ["hosting_event_state", "hosting_event_state"]);
  assert.deepEqual(calls.emails, []);
  assert.deepEqual(calls.invalidations, [`/host/orders/${orderId}`, "/host/orders", "/finance/planning"]);
});

test("marking requires a received deposit, full rental payment, and the event to have ended", async () => {
  for (const [options, message] of [
    [{ depositReceived: 0 }, /received deposit/],
    [{ rentalPaid: 1399 }, /full rental payment/],
    [{ eventEndDate: "2026-10-20" }, /after the event ends/],
  ]) {
    const { markReturned, calls } = depositReturn(options);
    const result = await markReturned();
    assert.equal(result.ok, false);
    assert.match(result.error, message);
    assert.deepEqual(calls.writes, []);
    assert.deepEqual(calls.emails, []);
  }
});

test("read-only access cannot read payment records or record a return", async () => {
  const { markReturned, calls } = depositReturn({ readOnly: true });
  await assert.rejects(markReturned(), /Unauthorized/);
  assert.deepEqual(calls.tables, []);
  assert.deepEqual(calls.writes, []);
});

test("cancelled orders cannot record returns", async () => {
  for (const options of [{ cancelledAt: today }, { statusOverride: "cancelled" }]) {
    const { markReturned, calls } = depositReturn(options);
    assert.equal((await markReturned()).ok, false);
    assert.deepEqual(calls.tables, []);
    assert.deepEqual(calls.writes, []);
  }
});

test("repeated marking keeps the first recorded return and does not write again", async () => {
  const { markReturned, calls } = depositReturn();
  const first = await markReturned();
  const writes = calls.writes.length;
  assert.deepEqual(await markReturned(), first);
  assert.equal(calls.writes.length, writes);
  assert.deepEqual(calls.emails, []);
});

test("existing return details stay unchanged when marking again", async () => {
  const refund = { amount: 250, date: "2026-10-17", method: "Zelle" };
  const { markReturned, calls } = depositReturn({ refund });
  assert.deepEqual(await markReturned(), { ok: true, data: refund });
  assert.deepEqual(calls.tables, []);
  assert.deepEqual(calls.writes, []);
});

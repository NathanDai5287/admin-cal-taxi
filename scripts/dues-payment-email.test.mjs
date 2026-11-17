import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const fixtures = `
export const state = { sends: [], fail: false, member: { email: "alex@example.test" },
  charge: { id: "charge-1", member_id: "member-1", member_name: "Alex", amount_assessed: 1000, amount_paid: 300,
    due_date: "2026-11-01", payment_plan_frequency: "monthly", payment_plan_amount: 250,
    payment_plan_interval_days: null, payment_plan_start_date: "2026-10-01" },
  events: [{ id: "payment-1", amount: 300, paid_date: "2026-11-16", date_is_estimated: false, created_at: "2026-11-16T12:00:00Z" }] };
export function createAdminClient() { return { from(table) {
  const value = () => table === "chapter_receivables" ? state.charge : table === "profiles" ? state.member : state.events;
  const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
    range() { return Promise.resolve({ data: value(), error: null }); },
    single() { return Promise.resolve({ data: value(), error: null }); },
    maybeSingle() { return Promise.resolve({ data: state.events.at(-1) || null, error: null }); } };
  return query;
} }; }
export async function sendEmailWithRetry(body, key) {
  if (state.fail) throw new Error("Provider unavailable");
  state.sends.push({ body, key });
}
`;
const bundled = await build({
  stdin: { contents: 'export * from "./lib/reimbursements/dues-payment-email"; export * from "./lib/reimbursements/send-dues-payment-email"; export { state } from "dues-fixtures";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "dues-fixtures", setup(builder) {
    builder.onResolve({ filter: /^(server-only|dues-fixtures)$|supabase\/admin$|\.\.\/email-send$/ }, ({ path }) => ({ path: path === "server-only" ? "empty" : "fixtures", namespace: "dues-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "dues-fixture" }, ({ path }) => ({ contents: path === "empty" ? "" : fixtures }));
  } }],
});
const { duesPaymentEmail, duesInstallments, sendDuesPaymentConfirmation, state } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const receipt = {
  memberName: 'Alex <script>"&', chargeId: "charge-1", assessed: 1000, paid: 300, dueDate: "2026-11-30",
  plan: { frequency: "monthly", amount: 250, intervalDays: null, startDate: "2026-10-31" },
  payment: { amount: 50, paidDate: "2026-11-16" },
  payments: [{ id: "1", amount: 250, paidDate: "2026-10-31", estimated: true }, { id: "2", amount: 50, paidDate: "2026-11-16", estimated: false }],
};

test("the full schedule preserves month-end dates and allocates partial payments", () => {
  assert.deepEqual(duesInstallments(receipt), [
    { dueDate: "2026-10-31", amount: 250, remaining: 0, status: "Paid" },
    { dueDate: "2026-11-30", amount: 250, remaining: 200, status: "Part paid" },
    { dueDate: "2026-12-31", amount: 250, remaining: 250, status: "Due" },
    { dueDate: "2027-01-31", amount: 250, remaining: 250, status: "Due" },
  ]);
});

test("weekly, biweekly and custom plans preserve each installment and the final cents", () => {
  for (const [frequency, intervalDays, expected] of [["weekly", null, "2026-11-07"], ["biweekly", null, "2026-11-14"], ["custom", 10, "2026-11-10"]]) {
    const schedule = duesInstallments({ ...receipt, assessed: 500.29, plan: { ...receipt.plan, frequency, intervalDays } });
    assert.equal(schedule[1].dueDate, expected);
    assert.equal(schedule[2].amount, 0.29);
  }
});

test("HTML and plain text include payments, totals, dates and escaped member names", () => {
  const email = duesPaymentEmail(receipt);
  for (const part of [email.text, email.html]) {
    for (const expected of ["$1,000.00", "$300.00", "$700.00", "$50.00", "Jan 31, 2027", "Part paid", "$200.00", "charge-1"]) assert.ok(part.includes(expected), expected);
  }
  assert.ok(email.html.includes("Alex &lt;script&gt;&quot;&amp;"));
  assert.ok(!email.html.includes("Alex <script>"));
  assert.ok(email.text.includes("estimated date"));
  assert.ok(email.html.includes("Estimated date"));
});

test("fully paid single charges show no next payment and preserve adjustments", () => {
  const email = duesPaymentEmail({ ...receipt, plan: null, paid: 1000, payments: [...receipt.payments, { id: "3", amount: -50, paidDate: "2026-11-16", estimated: false }] });
  assert.ok(email.html.includes("No further payment is due"));
  assert.ok(email.html.includes("Single payment"));
  assert.ok(email.html.includes("Adjustment"));
  assert.deepEqual(duesInstallments({ ...receipt, plan: null, paid: 1000 }), [{ dueDate: "2026-11-30", amount: 1000, remaining: 0, status: "Paid" }]);
});

test("a new positive payment sends only to the linked member using its event key", async () => {
  assert.equal(await sendDuesPaymentConfirmation("charge-1", []), "Confirmation email sent.");
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].key, "dues-payment/payment-1");
  assert.equal(state.sends[0].body.to, "alex@example.test");
  assert.ok(state.sends[0].body.html.includes("$700.00"));
});

test("replayed requests, reversals, and missing recipients never send another email", async () => {
  assert.equal(await sendDuesPaymentConfirmation("charge-1", ["payment-1"]), "");
  state.events[0].amount = -100;
  assert.equal(await sendDuesPaymentConfirmation("charge-1", []), "");
  state.events[0].amount = 300;
  state.member.email = "";
  assert.match(await sendDuesPaymentConfirmation("charge-1", []), /no email address/);
  state.member.email = "alex@example.test";
  state.charge.member_id = null;
  assert.match(await sendDuesPaymentConfirmation("charge-1", []), /no linked member/);
  state.charge.member_id = "member-1";
  assert.equal(state.sends.length, 1);
});

test("delivery failure keeps the saved payment and returns a visible warning", async () => {
  state.fail = true;
  assert.match(await sendDuesPaymentConfirmation("charge-1", []), /payment is saved.*could not be sent/);
  assert.equal(state.charge.amount_paid, 300);
  assert.equal(state.sends.length, 1);
});


test("close payments receive distinct receipts with stable history and totals", async () => {
  state.fail = false;
  state.sends.length = 0;
  state.events.push({ id: "payment-2", amount: 250, paid_date: "2026-11-17", date_is_estimated: false, created_at: "2026-11-17T12:00:00Z" });
  state.charge.amount_paid = 550;
  await sendDuesPaymentConfirmation("charge-1", []);
  await sendDuesPaymentConfirmation("charge-1", []);
  assert.deepEqual(state.sends.map(({ key }) => key), ["dues-payment/payment-1", "dues-payment/payment-2", "dues-payment/payment-1", "dues-payment/payment-2"]);
  assert.deepEqual(state.sends[0], state.sends[2]);
  assert.deepEqual(state.sends[1], state.sends[3]);
  assert.ok(state.sends[0].body.html.includes("$700.00"));
  assert.ok(state.sends[1].body.html.includes("$450.00"));
  assert.ok(!state.sends[0].body.html.includes("Nov 17, 2026"));
});

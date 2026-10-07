import assert from "node:assert/strict";
import test from "node:test";
import { compareDuesBalances, defaultDuesPaymentAmount, paymentPlanFrequencyLabel } from "../lib/reimbursements/dues-payment-plan.ts";

const plan = { frequency: "monthly", amount: 250, intervalDays: null };
const balance = { id: "1", memberName: "Zoe", dueDate: "2026-12-01", amountOwed: 1000, isPaid: false, paymentPlan: plan };

test("planned payments default to the agreed amount and cap the final installment in cents", () => {
  assert.equal(defaultDuesPaymentAmount(balance), "250.00");
  assert.equal(defaultDuesPaymentAmount({ ...balance, amountOwed: 100 }), "100.00");
  assert.equal(defaultDuesPaymentAmount({ ...balance, amountOwed: 0.29 }), "0.29");
  assert.equal(defaultDuesPaymentAmount({ ...balance, amountOwed: 0 }), "");
  assert.equal(defaultDuesPaymentAmount({ ...balance, paymentPlan: null }), "");
});

test("plans stay first under all sort options before pagination", () => {
  const ordinary = Array.from({ length: 30 }, (_, index) => ({ ...balance, id: `ordinary-${index}`, memberName: `Alex ${index}`, dueDate: "2026-01-01", amountOwed: 2000, paymentPlan: null }));
  for (const sort of ["due-date", "name", "amount"]) {
    const rows = [...ordinary, balance].sort((a, b) => compareDuesBalances(a, b, sort));
    assert.equal(rows.slice(0, 25)[0].id, balance.id);
    assert.ok(compareDuesBalances({ ...balance, isPaid: true, amountOwed: 0 }, ordinary[0], sort) > 0);
    const reopened = { ...balance, isPaid: false };
    assert.ok(compareDuesBalances(reopened, ordinary[0], sort) < 0);
  }
});

test("each group preserves the selected sort and deterministic name/id tie breakers", () => {
  const other = { ...balance, id: "2", memberName: "Alex", dueDate: "2027-01-01", amountOwed: 500 };
  assert.ok(compareDuesBalances(balance, other, "due-date") < 0);
  assert.ok(compareDuesBalances(balance, other, "name") > 0);
  assert.ok(compareDuesBalances(balance, other, "amount") < 0);
  assert.ok(compareDuesBalances(balance, { ...balance, id: "2" }, "amount") < 0);
});

test("frequency labels distinguish calendar months, weeks, and custom day intervals", () => {
  assert.equal(paymentPlanFrequencyLabel(plan), "monthly");
  assert.equal(paymentPlanFrequencyLabel({ ...plan, frequency: "weekly" }), "weekly");
  assert.equal(paymentPlanFrequencyLabel({ ...plan, frequency: "biweekly" }), "every two weeks");
  assert.equal(paymentPlanFrequencyLabel({ ...plan, frequency: "custom", intervalDays: 1 }), "every 1 day");
  assert.equal(paymentPlanFrequencyLabel({ ...plan, frequency: "custom", intervalDays: 10 }), "every 10 days");
});

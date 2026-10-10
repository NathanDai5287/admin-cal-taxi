import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, restoreDemoState, totals, setExpenseStatus, recordDues, csvCell, demoSchema } from "../lib/demo/model.ts";

test("sample state is valid, independent, and uses fictional email domains", () => {
  const first = createDemoState();
  assert.deepEqual(demoSchema.parse(first), first);
  assert.ok(first.members.every(m => m.email.endsWith("@example.com")));
  first.members[0].paid = 0;
  assert.equal(createDemoState().members[0].paid, 650);
});

test("approval and payment update budget commitments and cash exactly once", () => {
  const seed = createDemoState();
  const expense = seed.expenses[0];
  const approved = setExpenseStatus(seed, expense.id, "Approved");
  assert.equal(totals(approved).pending, totals(seed).pending - 1);
  assert.equal(totals(approved).cash, totals(seed).cash);
  const paid = setExpenseStatus(approved, expense.id, "Paid");
  assert.equal(totals(paid).cash, totals(seed).cash - expense.amount);
  assert.deepEqual(setExpenseStatus(paid, expense.id, "Paid"), paid);
  assert.deepEqual(setExpenseStatus(paid, expense.id, "Pending"), paid);
  assert.deepEqual(setExpenseStatus(seed, expense.id, "Paid"), seed);
});

test("dues payments reduce balances and reject overpayments and nonfinite values", () => {
  const seed = createDemoState();
  const next = recordDues(seed, "M-2", 100.25);
  assert.equal(totals(next).outstanding, totals(seed).outstanding - 100.25);
  assert.equal(totals(next).cash, totals(seed).cash + 100.25);
  for (const amount of [-1, 0, Infinity, NaN, 326]) assert.throws(() => recordDues(seed, "M-2", amount));
  assert.throws(() => recordDues(seed, "missing", 1));
});

test("stored changes round trip; corrupted, obsolete and incomplete state resets safely", () => {
  const changed = recordDues(createDemoState(), "M-2", 20);
  assert.deepEqual(restoreDemoState(JSON.stringify(changed)), changed);
  for (const value of [null, "broken", "{}", '{"version":2}', JSON.stringify({ ...changed, expenses: [{ amount: -1 }] })]) {
    assert.deepEqual(restoreDemoState(value), createDemoState());
  }
});

test("CSV escapes formulas and quoted commas in user-entered sample data", () => {
  assert.equal(csvCell('A, "B"'), '"A, ""B"""');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell(120.5), '"120.5"');
});

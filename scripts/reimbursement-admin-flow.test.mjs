import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the payable page shows every reimbursement without payment filters", async () => {
  const source = await readSource("../app/(admin)/finance/accounts/payable/page.tsx");

  assert.doesNotMatch(source, /searchParams|Needs payment|Paid history/);
  assert.doesNotMatch(source, /\.eq\("status"|\.eq\("reimbursed"/);
  assert.match(source, /<ReimbursementPaymentTable rows=\{rows\}/);
});

test("the combined table keeps review and payout controls", async () => {
  const source = await readSource("../components/reimbursements/reimbursement-payment-table.tsx");

  assert.match(source, /<InlineStatusSelect/);
  assert.match(source, /<ReimbursedCheckbox/);
  assert.match(source, /Select all approved unpaid reimbursements/);
  assert.match(source, /\/finance\/accounts\/payable\/\$\{item\.id\}/);
});

test("finance navigation no longer shows a review tab", async () => {
  const source = await readSource("../app/(admin)/finance/layout.tsx");

  assert.doesNotMatch(source, /label: "Review"/);
});

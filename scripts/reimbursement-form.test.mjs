import assert from "node:assert/strict";
import test from "node:test";

import { reimbursementSchema } from "../lib/reimbursements/format.ts";

const validSubmission = {
  category: "administration",
  amount: "12.50",
  description: "Printer paper",
  paymentMethod: "member@example.com",
};

test("accepts a reimbursement without a submitted name", () => {
  assert.equal(reimbursementSchema.safeParse(validSubmission).success, true);
});

test("does not include a client-provided name", () => {
  const result = reimbursementSchema.parse({
    ...validSubmission,
    fullName: "Untrusted Name",
  });

  assert.equal("fullName" in result, false);
});

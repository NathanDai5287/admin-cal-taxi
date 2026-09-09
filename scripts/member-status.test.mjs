import assert from "node:assert/strict";
import test from "node:test";
import { memberStatus, memberPaymentStatus, memberSubmissionDate } from "../lib/reimbursements/member-status.ts";

test("member labels distinguish automatic verification from approval", () => {
  for (const [status, label] of Object.entries({ pending: "Checking receipt", verified: "Awaiting review", mismatch: "Needs review", processing_failed: "Needs review", approved: "Approved", denied: "Denied" })) {
    assert.equal(memberStatus(status).label, label);
  }
  assert.match(memberStatus("verified").explanation, /still needs to approve/);
  assert.match(memberStatus("processing_failed").explanation, /not a denial/);
});

test("payment is independent of review status, including conflicting records", () => {
  for (const status of ["pending", "verified", "mismatch", "processing_failed", "approved", "denied"]) {
    assert.equal(memberPaymentStatus(status, true), "Paid");
    assert.equal(memberPaymentStatus(status, false), status === "approved" ? "Awaiting payment" : "Not paid");
  }
  assert.equal(memberStatus("denied").label, "Denied");
});

test("unknown statuses never imply approval and dates use chapter timezone", () => {
  assert.equal(memberStatus("unexpected").label, "Awaiting review");
  assert.equal(memberSubmissionDate("2026-09-09T01:00:00Z"), "Sep 8, 2026");
});

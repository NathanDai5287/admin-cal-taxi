import assert from "node:assert/strict";
import test from "node:test";

import {
  reportDuesInsertFailure,
  reportDuesProfilePreflightFailure,
} from "../lib/reimbursements/dues-charge-errors.ts";

const supabaseError = {
  code: "23503",
  message: "Foreign key failed",
  details: "Safe database detail",
  hint: "Refresh the member list",
};

function captureError(run) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    const result = run();
    return { calls, result };
  } finally {
    console.error = original;
  }
}

test("profile preflight failures log safe details and request a member refresh", () => {
  const selectedMemberIds = ["pending-id", "active-id"];
  const loadedMemberIds = ["active-id"];
  const { calls, result } = captureError(() => reportDuesProfilePreflightFailure({
    error: supabaseError,
    selectedMemberIds,
    loadedMemberIds,
  }));

  assert.equal(result, "member-selection-changed");
  assert.deepEqual(calls, [["Dues charge save failed", {
    stage: "profile_preflight",
    databaseError: supabaseError,
    selectedMemberIds,
    selectedMemberCount: 2,
    loadedMemberIds,
    loadedMemberCount: 1,
  }]]);
});

test("insert failures log safe details and report that no charge was added", () => {
  const selectedMemberIds = ["pending-id"];
  const { calls, result } = captureError(() => reportDuesInsertFailure({
    error: supabaseError,
    selectedMemberIds,
  }));

  assert.equal(result, "charge-insert-failed");
  assert.deepEqual(calls, [["Dues charge save failed", {
    stage: "receivables_insert",
    databaseError: supabaseError,
    selectedMemberIds,
    selectedMemberCount: 1,
  }]]);
});

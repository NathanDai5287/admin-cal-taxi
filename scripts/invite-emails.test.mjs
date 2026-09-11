import assert from "node:assert/strict";
import test from "node:test";

import { parseInviteEmails } from "../lib/reimbursements/invite-emails.ts";

test("parses, normalizes, and deduplicates comma-separated emails", () => {
  assert.deepEqual(
    parseInviteEmails(" Alex@example.com, jordan@example.com, alex@example.com "),
    ["alex@example.com", "jordan@example.com"],
  );
});

test("keeps the existing single-email behavior", () => {
  assert.deepEqual(parseInviteEmails("member@example.com"), ["member@example.com"]);
});

test("rejects an invalid address in a list", () => {
  assert.throws(
    () => parseInviteEmails("member@example.com, not-an-email"),
    /valid email address/,
  );
});

test("rejects more than 50 distinct invites", () => {
  const emails = Array.from({ length: 51 }, (_, index) => `member${index}@example.com`).join(",");
  assert.throws(() => parseInviteEmails(emails), /up to 50/);
});

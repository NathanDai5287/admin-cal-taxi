import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { userLabel } from "../lib/reimbursements/user-label.ts";

test("user labels prefer names and use email only as a fallback", () => {
  assert.equal(userLabel("  Alex Member  ", "alex@example.com"), "Alex Member");
  assert.equal(userLabel("   ", "alex@example.com"), "alex@example.com");
});

test("dues member choices do not append email to a name", async () => {
  const [ledgerSource, pageSource] = await Promise.all([
    readFile(new URL("../app/(admin)/finance/accounts/receivable/dues-ledger.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/finance/accounts/receivable/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(ledgerSource, /member\.name\}\s*·\s*\{member\.email/);
  assert.match(pageSource, /memberLabels\.get\(row\.member_id\) \?\? row\.member_name/);
});

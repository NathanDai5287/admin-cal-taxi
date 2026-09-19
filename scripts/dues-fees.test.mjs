import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receivablesDirectory = new URL("../app/(admin)/finance/accounts/receivable/", import.meta.url);

test("bulk charges use one shared reason", async () => {
  const [form, action] = await Promise.all([
    readFile(new URL("bulk-fee-form.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("actions.ts", receivablesDirectory), "utf8"),
  ]);

  assert.equal(form.match(/name="notes"/g)?.length, 1);
  assert.doesNotMatch(form, /notes:\$\{/);
  assert.match(action, /notes: formData\.get\("notes"\)/);
  assert.match(action, /notes: parsed\.data\.notes/);
});

test("existing charges expose and save due date changes", async () => {
  const [ledger, action] = await Promise.all([
    readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("actions.ts", receivablesDirectory), "utf8"),
  ]);

  assert.match(ledger, />Edit charge<\/Button>/);
  assert.match(ledger, /name="dueDate" type="date" required/);
  assert.match(action, /dueDate: formData\.get\("dueDate"\)/);
  assert.match(action, /due_date: parsed\.data\.dueDate/);
});

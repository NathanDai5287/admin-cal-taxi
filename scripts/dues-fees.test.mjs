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

test("charge edits use action state without redirect navigation", async () => {
  const [ledger, action, migration] = await Promise.all([
    readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("actions.ts", receivablesDirectory), "utf8"),
    readFile(new URL("../supabase/migrations/20260923000000_atomic_bulk_receivable_edits.sql", import.meta.url), "utf8"),
  ]);

  assert.match(ledger, /useActionState\(bulkUpdateDuesBalances/);
  assert.match(ledger, /name="applyMember"/);
  assert.match(ledger, /name="memberId"/);
  assert.match(ledger, /name="applyDueDate"/);
  assert.match(ledger, /name="applyAmount"/);
  assert.match(ledger, /name="applyNotes"/);
  assert.doesNotMatch(action.slice(action.indexOf("export async function updateDuesBalance")), /redirect\(resultUrl\("saved"\)\)/);
  assert.match(action, /return actionSuccess\(`\$\{parsed\.data\.rows\.length\}/);
  assert.match(action, /p_member_id: parsed\.data\.memberId/);
  assert.match(migration, /set member_id = case when p_apply_member/);
  assert.match(migration, /member_name = case when p_apply_member/);
  assert.match(migration, /discord_user_id = case when p_apply_member/);
});

test("bulk editor stays beside charges on desktop and stacks below them on mobile", async () => {
  const [ledger, styles] = await Promise.all([
    readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("../app/brand.css", import.meta.url), "utf8"),
  ]);

  assert.ok(ledger.indexOf('className="dues-bulk-list"') < ledger.indexOf('className="dues-bulk-inspector"'));
  assert.match(styles, /dues-bulk-workspace\.has-inspector[^\n]+grid[^\n]+320px/);
  assert.match(styles, /dues-bulk-inspector \{[\s\S]*?position: sticky/);
  assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?dues-bulk-workspace\.has-inspector[^\n]+grid-cols-1/);
  assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?dues-bulk-inspector \{[\s\S]*?position: static/);
});

test("new feedback wins and successful bulk actions clear selection", async () => {
  const [ledger, action] = await Promise.all([
    readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("actions.ts", receivablesDirectory), "utf8"),
  ]);

  assert.match(action, /sequence: Date\.now\(\)/);
  assert.match(ledger, /state\.sequence > latest\.sequence/);
  assert.match(ledger, /latestBulkState\.status !== "success"/);
  assert.match(ledger, /setSelectedIds\(\[\]\)/);
  assert.doesNotMatch(ledger, /some\(\(state\) => state\.status === "error"\)/);
});

test("charge rows support standard range and modifier selection", async () => {
  const ledger = await readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8");

  assert.match(ledger, /selectRange\(id: string, addToSelection: boolean\)/);
  assert.match(ledger, /event\.shiftKey, event\.metaKey \|\| event\.ctrlKey/);
  assert.match(ledger, /filtered\.slice\(rangeStart, rangeEnd \+ 1\)/);
  assert.match(ledger, /closest\("a, button, form, input, label, select, textarea/);
  assert.match(ledger, /Shift-click selects a range/);
});

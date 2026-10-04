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

test("selected charges expose and save due date changes", async () => {
  const [ledger, action] = await Promise.all([
    readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("actions.ts", receivablesDirectory), "utf8"),
  ]);

  assert.doesNotMatch(ledger, />Edit charge<\/Button>/);
  assert.match(ledger, /name="dueDate" required=\{applyDueDate\} type="date"/);
  assert.match(action, /dueDate: formData\.get\("dueDate"\)/);
  assert.match(action, /due_date: parsed\.data\.dueDate/);
});

test("existing balance rows use the bulk editor without profile icons", async () => {
  const ledger = await readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8");

  assert.doesNotMatch(ledger, /dues-avatar|Edit charge/);
  assert.match(ledger, /dues-bulk-inspector/);
  assert.match(ledger, /Record payment/);
  assert.match(ledger, /Waive selected/);
});

test("charge edits use action state without redirect navigation", async () => {
  const [ledger, action, migration] = await Promise.all([
    readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8"),
    readFile(new URL("actions.ts", receivablesDirectory), "utf8"),
    readFile(new URL("../supabase/migrations/20260923000000_atomic_bulk_receivable_edits.sql", import.meta.url), "utf8"),
  ]);

  assert.match(ledger, /useActionState\(bulkUpdateDuesBalances/);
  assert.doesNotMatch(ledger.slice(ledger.indexOf('className="dues-bulk-inspector"'), ledger.indexOf("{canManage && latestChargeState.message")), /name="applyMember"|name="memberId"/);
  assert.match(ledger, /name="applyDueDate"/);
  assert.match(ledger, /name="applyAmount"/);
  assert.match(ledger, /name="applyNotes"/);
  assert.doesNotMatch(action.slice(action.indexOf("export async function updateDuesBalance")), /redirect\(resultUrl\("saved"\)\)/);
  assert.match(action, /return actionSuccess\(`\$\{parsed\.data\.rows\.length\}/);
  assert.doesNotMatch(action.slice(action.indexOf("const bulkEditSchema")), /applyMember|p_member_id/);
  assert.doesNotMatch(migration, /p_apply_member|p_member_id|replacement_member/);
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

test("checkboxes support range selection while member names open details", async () => {
  const ledger = await readFile(new URL("dues-ledger.tsx", receivablesDirectory), "utf8");

  assert.match(ledger, /selectRange\(id: string, addToSelection: boolean\)/);
  assert.match(ledger, /selectRange\(row\.id, event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(ledger, /visibleRows\.slice\(rangeStart, rangeEnd \+ 1\)/);
  assert.match(ledger, /className="dues-member-button"[\s\S]*?setOpenRowId/);
  assert.match(ledger, /Shift-click selects a range/);
});

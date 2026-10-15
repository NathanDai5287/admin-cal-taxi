import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const reimbursementId = "11111111-1111-4111-8111-111111111111";

async function reviewActions() {
  const source = await readFile(new URL("../app/(admin)/finance/review/actions.ts", import.meta.url), "utf8");
  const databaseMock = `
    export const row = {};
    export const completed = new Set();
    export const controls = {};
    export function reset() {
      Object.assign(row, { id: '${reimbursementId}', category: 'rush', status: 'verified', reimbursed: false, updated_at: '2026-10-06', denial_reason: null });
      completed.clear(); Object.assign(controls, { failApproval: false, failReopen: false, completeOnApproval: false, reopenCount: 0 });
    }
    const setExpenseCategoryCompleted = async (category) => {
      controls.reopenCount += 1;
      if (controls.failReopen) return { status: 'error', message: 'Could not reopen. Try again.' };
      completed.delete(category); return { status: 'success', message: 'Saved' };
    };
    const createAdminClient = () => ({ from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row), error: null }) }) }),
      update: (values) => {
        const filters = [];
        const query = {
          eq: (key, value) => { filters.push([key, value, true]); return query; },
          neq: (key, value) => { filters.push([key, value, false]); return query; },
          select: () => query,
          maybeSingle: async () => {
            if (filters.some(([key, value, equal]) => equal ? row[key] !== value : row[key] === value)) return { data: null, error: null };
            if (controls.completeOnApproval) completed.add(row.category);
            if (values.status === 'approved' && completed.has(row.category)) return { data: null, error: { code: '23514', message: 'Reopen the completed category before approving this reimbursement', details: row.category } };
            if (controls.failApproval) return { data: null, error: { message: 'Write failed' } };
            Object.assign(row, values); return { data: structuredClone(row), error: null };
          }
        };
        return query;
      }
    }) });`;
  const isolated = source
    .replace('import { revalidatePath } from "next/cache";', "const revalidatePath = () => {};")
    .replace('import { z } from "zod";', `import { z } from "${new URL("../node_modules/zod/index.js", import.meta.url)}";`)
    .replace('import { requireAdmin } from "@/lib/reimbursements/auth";', "const requireAdmin = async () => ({ userId: 'admin' });")
    .replace(/import \{ categorySchema, categoryValues, type ReimbursementCategory \} from [^;]+;/, 'const categoryValues = ["rush", "house"]; const categorySchema = z.enum(categoryValues);')
    .replace('import { createAdminClient } from "@/lib/reimbursements/supabase/admin";', databaseMock)
    .replace('import { setExpenseCategoryCompleted } from "@/app/(admin)/finance/planning/actions";', "");
  const compiled = ts.transpileModule(isolated, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  actions.reset();
  return actions;
}

test("ordinary approval returns authoritative completed category without reopening", async () => {
  const { setReimbursementStatus, completed, row, controls } = await reviewActions();
  completed.add("rush");
  const result = await setReimbursementStatus(reimbursementId, "approved");
  assert.equal(result.ok, false);
  assert.equal(result.completedCategory, "rush");
  assert.equal(row.status, "verified");
  assert.equal(controls.reopenCount, 0);
});

test("explicit reopen approves and keeps the category open", async () => {
  const { setReimbursementStatus, completed, row } = await reviewActions();
  completed.add("rush");
  assert.equal((await setReimbursementStatus(reimbursementId, "approved", undefined, "rush")).ok, true);
  assert.equal(row.status, "approved");
  assert.equal(completed.has("rush"), false);
});

test("approval failure reports a successful reopen without reversing it", async () => {
  const { setReimbursementStatus, completed, row, controls } = await reviewActions();
  completed.add("rush");
  controls.failApproval = true;
  const result = await setReimbursementStatus(reimbursementId, "approved", undefined, "rush");
  assert.equal(result.ok, false);
  assert.match(result.message, /category reopened, but approval failed/);
  assert.equal(row.status, "verified");
  assert.equal(completed.has("rush"), false);
});

test("a category completed again during approval requires a new confirmation", async () => {
  const { setReimbursementStatus, completed, row, controls } = await reviewActions();
  completed.add("rush");
  controls.completeOnApproval = true;
  const result = await setReimbursementStatus(reimbursementId, "approved", undefined, "rush");
  assert.equal(result.ok, false);
  assert.equal(result.completedCategory, "rush");
  assert.match(result.message, /completed again/);
  assert.equal(row.status, "verified");
});

test("a changed reimbursement and a failed reopen cannot approve", async () => {
  const { setReimbursementStatus, completed, row, controls } = await reviewActions();
  completed.add("rush");
  row.category = "house";
  assert.equal((await setReimbursementStatus(reimbursementId, "approved", undefined, "rush")).ok, false);
  assert.equal(controls.reopenCount, 0);
  row.category = "rush";
  controls.failReopen = true;
  assert.equal((await setReimbursementStatus(reimbursementId, "approved", undefined, "rush")).ok, false);
  assert.equal(row.status, "verified");
  assert.equal(completed.has("rush"), true);
});

test("open-category approval and denial retain their existing behavior", async () => {
  const { setReimbursementStatus, completed, row } = await reviewActions();
  assert.equal((await setReimbursementStatus(reimbursementId, "approved")).ok, true);
  completed.add("rush");
  assert.equal((await setReimbursementStatus(reimbursementId, "denied", "Not covered")).ok, true);
  assert.equal(row.denial_reason, "Not covered");
  assert.equal(completed.has("rush"), true);
});

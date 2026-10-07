import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadAction() {
  const source = await readFile(new URL("../app/(admin)/finance/planning/actions.ts", import.meta.url), "utf8");
  const databaseMock = `
    export const writes = [];
    export const row = { category_amounts: { rush: 1000, house: 650 }, completed_categories: [], updated_at: 1 };
    export const controls = { conflicts: 0, failWrite: false };
    export function reset() { writes.length = 0; row.category_amounts = { rush: 1000, house: 650 }; row.completed_categories = []; row.updated_at = 1; controls.conflicts = 0; controls.failWrite = false; }
    const createAdminClient = () => ({ from: () => ({
      upsert: async (values) => { writes.push(values); Object.assign(row, values); row.updated_at += 1; return { error: null }; },
      select: () => ({ eq: () => ({ single: async () => ({ data: structuredClone(row), error: null }) }) }),
      update: (values) => {
        let expectedVersion;
        const query = {
          eq: (key, value) => { if (key === 'updated_at') expectedVersion = value; return query; },
          select: async () => {
            if (controls.failWrite) return { data: null, error: { message: 'Write failed' } };
            if (controls.conflicts > 0) { controls.conflicts -= 1; row.completed_categories = ['house']; row.updated_at += 1; }
            if (expectedVersion !== row.updated_at) return { data: [], error: null };
            writes.push(values); Object.assign(row, values); row.updated_at += 1;
            return { data: [{ id: true }], error: null };
          }
        };
        return query;
      }
    }) });`;
  const isolated = source
    .replace('import { revalidatePath } from "next/cache";', "const revalidatePath = () => {};")
    .replace('import { redirect } from "next/navigation";', "const redirect = () => {};")
    .replace('import { z } from "zod";', `import { z } from "${new URL("../node_modules/zod/index.js", import.meta.url)}";`)
    .replace('import { requireAdmin } from "@/lib/reimbursements/auth";', 'const requireAdmin = async () => ({ userId: "admin" });')
    .replace(/import \{ categories, categorySchema, type ReimbursementCategory \} from [^;]+;/, 'const categories = [["administration"], ["rush"], ["house"]]; const categorySchema = z.enum(["administration", "rush", "house"]);')
    .replace('import { createAdminClient } from "@/lib/reimbursements/supabase/admin";', databaseMock);
  const compiled = ts.transpileModule(isolated, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedActions = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  loadedActions.reset();
  return loadedActions;
}

test("saving editable plans cannot overwrite category completion", async () => {
  const { saveReimbursementBudgets, row, writes } = await loadAction();
  row.completed_categories = ["rush"];
  const form = new FormData();
  form.set("administration", "");
  form.set("rush", "1200");
  form.set("house", "700");
  await saveReimbursementBudgets({}, form);
  assert.deepEqual(row.completed_categories, ["rush"]);
  assert.deepEqual(writes.at(-1).category_amounts, { administration: null, rush: 1200, house: 700 });
  form.set("rush", "-1");
  assert.equal((await saveReimbursementBudgets({}, form)).status, "error");
  assert.equal(writes.length, 1);
});

test("completion and reopening preserve plans and other categories", async () => {
  const { setExpenseCategoryCompleted, row } = await loadAction();
  row.completed_categories = ["house"];
  assert.equal((await setExpenseCategoryCompleted("rush", true)).status, "success");
  assert.deepEqual(row.completed_categories, ["house", "rush"]);
  assert.deepEqual(row.category_amounts, { rush: 1000, house: 650 });
  await setExpenseCategoryCompleted("rush", false);
  assert.deepEqual(row.completed_categories, ["house"]);
});

test("concurrent completion retries preserve the other category", async () => {
  const { setExpenseCategoryCompleted, row, controls } = await loadAction();
  controls.conflicts = 1;
  assert.equal((await setExpenseCategoryCompleted("rush", true)).status, "success");
  assert.deepEqual(row.completed_categories, ["house", "rush"]);
});

test("completion reports failed writes and exhausted conflicts without overwriting", async () => {
  const { setExpenseCategoryCompleted, row, writes, controls } = await loadAction();
  controls.conflicts = 3;
  assert.equal((await setExpenseCategoryCompleted("rush", true)).status, "error");
  assert.deepEqual(row.completed_categories, ["house"]);
  controls.failWrite = true;
  assert.equal((await setExpenseCategoryCompleted("rush", true)).status, "error");
  assert.equal(writes.length, 0);
});

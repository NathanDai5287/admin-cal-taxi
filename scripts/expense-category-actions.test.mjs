import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadAction() {
  const source = await readFile(new URL("../app/(admin)/finance/planning/actions.ts", import.meta.url), "utf8");
  const isolated = source
    .replace('import { revalidatePath } from "next/cache";', "const revalidatePath = () => {};")
    .replace('import { redirect } from "next/navigation";', "const redirect = () => {};")
    .replace('import { z } from "zod";', `import { z } from "${new URL("../node_modules/zod/index.js", import.meta.url)}";`)
    .replace('import { requireAdmin } from "@/lib/reimbursements/auth";', 'const requireAdmin = async () => ({ userId: "admin" });')
    .replace('import { categories } from "@/lib/reimbursements/format";', 'const categories = [["administration"], ["rush"], ["house"]];')
    .replace('import { createAdminClient } from "@/lib/reimbursements/supabase/admin";', "export const writes = []; const createAdminClient = () => ({ from: () => ({ upsert: async (row) => { writes.push(row); return { error: null }; } }) });");
  const compiled = ts.transpileModule(isolated, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("completion and reopening save forecasts without changing unrelated category states", async () => {
  const { saveReimbursementBudgets, writes } = await loadAction();
  const form = new FormData();
  form.set("administration", "");
  form.set("rush", "1000");
  form.set("house", "650");
  form.set("completed-house", "on");
  form.set("complete-category", "rush");
  await saveReimbursementBudgets({}, form);
  assert.deepEqual(writes.at(-1).completed_categories, ["rush", "house"]);
  assert.deepEqual(writes.at(-1).category_amounts, { administration: null, rush: 1000, house: 650 });
  form.delete("complete-category");
  form.set("completed-rush", "on");
  form.set("reopen-category", "rush");
  await saveReimbursementBudgets({}, form);
  assert.deepEqual(writes.at(-1).completed_categories, ["house"]);
  assert.equal(writes.at(-1).category_amounts.rush, 1000);
  form.delete("reopen-category");
  form.delete("completed-rush");
  await saveReimbursementBudgets({}, form);
  assert.deepEqual(writes.at(-1).completed_categories, ["house"]);
  form.set("rush", "-1");
  assert.equal((await saveReimbursementBudgets({}, form)).status, "error");
  assert.equal(writes.length, 3);
});

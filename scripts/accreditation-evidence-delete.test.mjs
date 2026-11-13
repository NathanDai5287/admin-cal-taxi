import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

// Exercise the real action with database/auth/cache boundaries replaced. No live
// evidence is deleted, and a redirect would fail this isolated execution.
const source = await readFile(new URL("../app/(admin)/accreditation/actions.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);
const action = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "deleteSource");
assert.ok(action);
const compiled = ts.transpileModule(action.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const id = "10000000-0000-4000-8000-000000000001";

function fixture({ authorized = true, readError = null, found = true, deleteError = null, storageError = null } = {}) {
  const calls = [];
  let deleting = false;
  const query = {
    select() { return deleting ? Promise.resolve({ data: deleteError ? [] : [{ id }], error: deleteError }) : this; },
    eq() { return this; },
    async maybeSingle() { return { data: found ? { cycle_id: "cycle", storage_path: "original.pdf" } : null, error: readError }; },
    delete() { calls.push("delete"); deleting = true; return this; },
  };
  const actionModule = { exports: {} };
  new Function("uuid", "requireAccreditationAdmin", "createAccreditationAdminClient", "revalidatePath", "module", "exports", compiled)(
    z.string().uuid(),
    async () => { if (!authorized) throw new Error("Forbidden"); },
    () => ({
      from() { calls.push("database"); return query; },
      storage: { from() { return { async remove(paths) { calls.push(["storage", paths]); return { error: storageError }; } }; } },
    }),
    (...args) => calls.push(["revalidate", ...args]), actionModule, actionModule.exports,
  );
  const form = new FormData();
  form.set("sourceId", id);
  form.set("confirmDelete", "on");
  return { run: actionModule.exports.deleteSource, form, calls };
}

test("evidence deletion returns success without redirecting and cleans up storage", async () => {
  const { run, form, calls } = fixture();
  assert.equal((await run(form)).deleted, true);
  assert.ok(calls.indexOf("delete") < calls.findIndex((call) => Array.isArray(call) && call[0] === "storage"));
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "revalidate" && call[1] === "/ask-policy/evidence"));
});

test("authorization and confirmation are required before deletion", async () => {
  const forbidden = fixture({ authorized: false });
  await assert.rejects(forbidden.run(forbidden.form), /Forbidden/);
  assert.deepEqual(forbidden.calls, []);
  for (const field of ["confirmDelete", "sourceId"]) {
    const { run, form, calls } = fixture();
    form.delete(field);
    assert.ok((await run(form)).error);
    assert.deepEqual(calls, []);
  }
});

test("failed reads and protected documents return inline errors without removing originals", async () => {
  for (const options of [{ readError: { message: "unavailable" } }, { deleteError: { message: "Referenced by approved report" } }]) {
    const { run, form, calls } = fixture(options);
    assert.ok((await run(form)).error);
    assert.ok(!calls.some((call) => Array.isArray(call) && call[0] === "storage"));
  }
});

test("already deleted evidence succeeds and storage failures remain visible as warnings", async () => {
  const missing = fixture({ found: false });
  assert.equal((await missing.run(missing.form)).deleted, true);
  assert.ok(!missing.calls.includes("delete"));
  const cleanup = fixture({ storageError: { message: "unavailable" } });
  const result = await cleanup.run(cleanup.form);
  assert.equal(result.deleted, true);
  assert.match(result.warning, /cleanup failed/);
});

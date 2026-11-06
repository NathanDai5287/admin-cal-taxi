import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const state = { calls: [], error: null };
globalThis.__savedFormsTest = state;
const bundled = await build({ entryPoints: ["lib/accreditation/saved-forms.ts"], bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "mock-form-storage", setup(b) {
  b.onResolve({ filter: /^(server-only|\.\/supabase)$/ }, args => ({ path: args.path, namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "server-only" ? "" : `
    export function createAccreditationAdminClient() {
      const state = globalThis.__savedFormsTest;
      const query = { update(value) { state.calls.push(['update',value]); return query; }, eq(key,value) { state.calls.push(['eq',key,value]); return query; }, is(key,value) { state.calls.push(['is',key,value]); return Promise.resolve({error:state.error}); } };
      return { from(table) { state.calls.push(['from',table]); return query; } };
    }
  ` }));
} }] });
const { deleteSavedForm } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
test("deleting a form retains referenced originals and submissions", async () => {
  state.calls = [];
  const id = "10000000-0000-4000-8000-000000000001";
  await deleteSavedForm(id);
  assert.deepEqual(state.calls[0], ["from", "accreditation_template_families"]);
  assert.deepEqual(Object.keys(state.calls[1][1]), ["archived_at"]);
  assert.ok(!Number.isNaN(Date.parse(state.calls[1][1].archived_at)));
  assert.deepEqual(state.calls.slice(2), [["eq", "id", id], ["is", "archived_at", null]]);
});
test("invalid IDs never reach storage and failures are reported", async () => {
  state.calls = [];
  await assert.rejects(deleteSavedForm("not-an-id"));
  assert.deepEqual(state.calls, []);
  state.error = { message: "failure" };
  await assert.rejects(deleteSavedForm("10000000-0000-4000-8000-000000000001"), /could not be deleted/);
  state.error = null;
});

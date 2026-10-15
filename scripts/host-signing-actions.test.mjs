import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";

const source = await readFile(new URL("../app/(admin)/host/documents/signing-actions.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "cjs" });

function signingActions({ cancelledAt = null, statusOverride = null, orderExists = true } = {}) {
  const calls = [];
  const revision = { id: "revision_existing", order_id: "order_existing" };
  const modules = {
    "@/lib/reimbursements/auth": { requireAppAccess: async () => ({}) },
    "@/lib/host-orders": { getOrderFresh: async () => orderExists ? { statusOverride } : null },
    "@/lib/host-workflow": { loadWorkflow: async () => ({ cancelledAt }), registerSigning: async () => {} },
    "@/lib/host-signing": {
      prepareSigning: async (...args) => { calls.push(["prepare", ...args]); return revision; },
      createSigningLinks: async (...args) => { calls.push(["approve", ...args]); return revision; },
    },
    "next/cache": { revalidatePath() {} },
  };
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", compiled.code)(name => modules[name], compiledModule, compiledModule.exports);
  return { actions: compiledModule.exports, calls, revision };
}

test("cancelled orders cannot prepare or approve a signing request", async () => {
  for (const state of [{ cancelledAt: "2026-10-14T12:00:00Z" }, { statusOverride: "cancelled" }]) {
    const { actions, calls } = signingActions(state);
    await assert.rejects(actions.prepareSigningAction("order_existing", {}, "request", ""), /event is cancelled/);
    await assert.rejects(actions.createSigningLinksAction("order_existing", "revision_existing", "reviewed-hash", {}), /event is cancelled/);
    assert.deepEqual(calls, []);
  }
});

test("missing orders cannot prepare or approve a signing request", async () => {
  const { actions, calls } = signingActions({ orderExists: false });
  await assert.rejects(actions.prepareSigningAction("missing", {}, "request", ""), /Order not found/);
  await assert.rejects(actions.createSigningLinksAction("missing", "revision_existing", "reviewed-hash", {}), /Order not found/);
  assert.deepEqual(calls, []);
});

test("active orders retain the exact reviewed hash and activation data", async () => {
  const { actions, calls, revision } = signingActions();
  const payload = { eventDate: "2026-10-30" };
  const activation = { expectedUpdatedAt: "reviewed-order-version", replacesRevisionIds: [] };
  assert.deepEqual(await actions.prepareSigningAction("order_existing", payload, "request", "previous-revision"), revision);
  assert.deepEqual(await actions.createSigningLinksAction("order_existing", "revision_existing", "reviewed-hash", activation), revision);
  assert.deepEqual(calls, [
    ["prepare", "order_existing", payload, "request", "previous-revision"],
    ["approve", "order_existing", "revision_existing", "reviewed-hash", activation],
  ]);
});

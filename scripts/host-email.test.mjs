import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
const root = process.cwd(); const fixture = path.join(root, "scripts/host-email-fixture.ts");
const result = await build({ stdin: { contents: 'export * from "./lib/host-email"; export { state } from "./scripts/host-email-fixture";', resolveDir: root }, bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [{ name: "safe-transports", setup(build) {
  build.onResolve({ filter: /host-orders$|host-signing$|host-workflow$|host-backend$|supabase\/admin$/ }, () => ({ path: fixture }));
  build.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" }));
  build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
} }] });
// Use a temporary module beside dependencies so pdf-lib resolves normally.
const { writeFile, unlink } = await import("node:fs/promises");
const output = path.join(root, "node_modules/.host-email-test.mjs"); await writeFile(output, result.outputFiles[0].text);
const { state, prepareHostingEmail, deliverHostingEmails } = await import(`file://${output.replaceAll("\\", "/")}`); await unlink(output);
process.env.RESEND_API_KEY = "test-only"; process.env.HOST_EMAIL_REPLY_TO = "host@example.test";
const request = { orderId: state.order.id, revisionId: state.revision.id, expectedUpdatedAt: state.order.updatedAt, kind: "reminder", recipients: ["one@example.test"] };
test("reminders preserve envelope identity, refresh progress, and never leak another person's link", async () => {
  state.rows = []; state.cancelled = false; state.revision.recipients[0].status = "NOT_SIGNED";
  const snapshot = JSON.stringify(state.revision); const previews = await prepareHostingEmail(request);
  const calls = []; globalThis.fetch = async (url, init) => { assert.equal(url, "https://api.resend.com/emails"); calls.push(JSON.parse(init.body)); return Response.json({ id: "provider_test" }); };
  const result = await deliverHostingEmails(state.order.id, previews.map(p => p.id));
  assert.equal(result.sent, 1); assert.ok(state.syncs >= 1); assert.equal(JSON.stringify(state.revision), snapshot);
  assert.deepEqual(calls[0].to, ["one@example.test"]); assert.match(calls[0].html, /sign\/one/); assert.doesNotMatch(calls[0].html, /sign\/two/);
  await deliverHostingEmails(state.order.id, previews.map(p => p.id)); assert.equal(calls.length, 1);
});
test("a person signing after preview is skipped at send time", async () => {
  state.rows = []; const previews = await prepareHostingEmail(request); state.revision.recipients[0].status = "SIGNED";
  globalThis.fetch = async () => { throw Error("Must not email a signed person"); };
  const result = await deliverHostingEmails(state.order.id, previews.map(p => p.id)); assert.equal(result.skipped, 1); assert.equal(result.sent, 0);
  state.revision.recipients[0].status = "NOT_SIGNED";
});
test("failed delivery retries use the exact frozen body and idempotency key", async () => {
  state.rows = []; const previews = await prepareHostingEmail(request); const calls = [];
  globalThis.fetch = async (_url, init) => { calls.push({ key: init.headers["Idempotency-Key"], body: init.body }); return calls.length === 1 ? Response.json({ message: "Temporary failure" }, { status: 503 }) : Response.json({ id: "provider_retry" }); };
  assert.equal((await deliverHostingEmails(state.order.id, previews.map(p => p.id))).errors.length, 1);
  assert.equal((await deliverHostingEmails(state.order.id, previews.map(p => p.id))).sent, 1); assert.deepEqual(calls[0], calls[1]);
});
test("cancellation and changed order terms block previously prepared emails", async () => {
  state.rows = []; const previews = await prepareHostingEmail(request); state.cancelled = true;
  await assert.rejects(deliverHostingEmails(state.order.id, previews.map(p => p.id)), /cancelled/); state.cancelled = false;
  state.order.rentalPrice = 1500; const result = await deliverHostingEmails(state.order.id, previews.map(p => p.id)); assert.equal(result.sent, 0); assert.match(result.errors[0], /changed/); state.order.rentalPrice = 1400;
});
test("warming and reopening a private preview reuses exact PDF bytes without syncing or regenerating", async () => {
  state.rows = []; state.files = 0; state.syncs = 0;
  const input = { ...request, kind: "invitation", recipients: undefined };
  const first = await prepareHostingEmail(input);
  assert.equal(first.length, 2); assert.equal(state.files, 1); assert.equal(state.syncs, 0);
  const second = await prepareHostingEmail(input);
  assert.deepEqual(second, first); assert.equal(state.files, 1); assert.equal(state.syncs, 0);
  assert.equal(state.rows.length, 2);
});

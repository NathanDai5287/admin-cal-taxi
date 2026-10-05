import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
const root = process.cwd(); const fixture = path.join(root, "scripts/host-email-fixture.ts");
const result = await build({ stdin: { contents: 'export * from "./lib/host-email"; export { hostingEmailDraft } from "./lib/host-email-draft"; export { state } from "./scripts/host-email-fixture";', resolveDir: root }, bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [{ name: "safe-transports", setup(build) {
  build.onResolve({ filter: /host-orders$|host-signing$|host-workflow$|host-backend$|supabase\/admin$/ }, () => ({ path: fixture }));
  build.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" }));
  build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
} }] });
// Use a temporary module beside dependencies so pdf-lib resolves normally.
const { writeFile, unlink } = await import("node:fs/promises");
const output = path.join(root, "node_modules/.host-email-test.mjs"); await writeFile(output, result.outputFiles[0].text);
const { state, prepareHostingEmail, deliverHostingEmails, hostingEmailDraft } = await import(`file://${output.replaceAll("\\", "/")}`); await unlink(output);
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

test("both shared invoices include all six club representatives, including signed people", async () => {
  const originalOrder = structuredClone(state.order);
  const originalRevision = structuredClone(state.revision);
  try {
    state.rows = [];
    state.revision.recipients = Array.from({ length: 6 }, (_, index) => ({ name: `Club ${index + 1}`, email: `club${index}@example.test`, status: index === 0 ? "SIGNED" : "NOT_SIGNED", link: `https://example.test/sign/${index}` }));
    state.order.snapshot.contractSigners = state.revision.recipients.map(p => ({ email: p.email }));
    // An internal chapter signer must not receive a renter's invoice.
    state.revision.recipients.push({ name: "Host", email: "host@example.test", status: "SIGNED", link: "https://example.test/sign/host" });
    state.order.documents = ["deposit_invoice", "rental_invoice"].map(kind => ({ kind, stale: false, sourceSnapshot: {}, generatedAt: "2026-10-04", payload: {} }));
    const generated = []; const sent = [];
    globalThis.fetch = async (url, init) => {
      if (url === "https://api.resend.com/emails") { sent.push(JSON.parse(init.body)); return Response.json({ id: "invoice-provider" }); }
      generated.push(url); return new Response("same shared invoice PDF", { headers: { "Content-Type": "application/pdf" } });
    };
    for (const kind of ["deposit_invoice", "rental_invoice"]) {
      const previews = await prepareHostingEmail({ ...request, kind, recipients: ["club0@example.test"] });
      const draft = hostingEmailDraft(state.order, state.revision, kind, 0, process.env.HOST_EMAIL_REPLY_TO);
      assert.deepEqual(draft.map(p => [p.recipient, p.html]), previews.map(p => [p.recipient, p.html]));
      assert.equal(previews.length, 6);
      assert.deepEqual(previews.map(p => p.recipient), state.order.snapshot.contractSigners.map(p => p.email));
      assert.match(previews[0].html, kind === "deposit_invoice" ? /\$300\.00 is the total across all clubs/ : /\$1400\.00 is the total across all clubs/);
      await assert.rejects(deliverHostingEmails(state.order.id, [previews[0].id]), /every club representative/);
      assert.equal((await deliverHostingEmails(state.order.id, previews.map(p => p.id))).sent, 6);
    }
    assert.equal(generated.length, 2);
    assert.equal(sent.length, 12);
    assert.ok(sent.every(body => body.to.length === 1));
    assert.ok(sent.slice(0, 6).every(body => body.attachments[0].content === sent[0].attachments[0].content));
    const sentBodies = JSON.stringify(state.rows.map(row => row.payload));
    await prepareHostingEmail({ ...request, kind: "deposit_invoice", recipients: undefined });
    assert.equal(JSON.stringify(state.rows.map(row => row.payload)), sentBodies);
  } finally { state.order = originalOrder; state.revision = originalRevision; state.rows = []; }
});

test("old invoice drafts gain shared-balance copy without changing frozen retries or PDF bytes", async () => {
  const originalOrder = structuredClone(state.order);
  try {
    state.rows = [];
    state.order.documents = [{ kind: "deposit_invoice", stale: false, sourceSnapshot: {}, generatedAt: "2026-10-04", payload: {} }];
    globalThis.fetch = async () => new Response("invoice bytes", { headers: { "Content-Type": "application/pdf" } });
    const input = { ...request, kind: "deposit_invoice", recipients: undefined };
    await prepareHostingEmail(input);
    for (const row of state.rows) { row.payload.body.html = "old invoice copy"; row.payload.body.text = "old invoice copy"; }
    state.rows[1].status = "failed"; state.rows[1].attempted_at = "2026-10-04T12:00:00Z";
    const attachments = JSON.stringify(state.rows.map(row => row.payload.body.attachments));
    const ids = state.rows.map(row => row.id);
    globalThis.fetch = async () => { throw Error("Must reuse invoice PDF"); };
    const updated = await prepareHostingEmail(input);
    assert.match(updated[0].html, /\$300\.00 is the total across all clubs/);
    assert.equal(updated[1].html, "old invoice copy");
    assert.deepEqual(updated.map(row => row.id), ids);
    assert.equal(JSON.stringify(state.rows.map(row => row.payload.body.attachments)), attachments);
  } finally { state.order = originalOrder; state.rows = []; }
});

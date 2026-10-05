import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { createHash } from "node:crypto";
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
      assert.equal(previews.length, 1);
      assert.equal(previews[0].recipient, state.order.snapshot.contractSigners.map(p => p.email).join(", "));
      assert.match(previews[0].html, kind === "deposit_invoice" ? /\$300\.00 is the total across all clubs/ : /\$1400\.00 is the total across all clubs/);
      assert.match(previews[0].html, kind === "deposit_invoice" ? /deposit is due October 9, 2026/ : /rental fee is due October 18, 2026/);
      if (kind === "deposit_invoice") assert.match(previews[0].html, /October 9, 2026, seven days before the event/);
      assert.match(previews[0].html, /Include a relevant payment note\./);
      assert.doesNotMatch(previews[0].html, /Include the event date in the payment note/);
      assert.match(previews[0].html, /Zelle at calthetaxi@gmail\.com/);
      assert.match(previews[0].html, /Would you prefer cash or credit card\?/);
      assert.match(previews[0].html, /Credit card payments have a 3% surcharge/);
      assert.equal((await deliverHostingEmails(state.order.id, previews.map(p => p.id))).sent, 1);
    }
    assert.equal(generated.length, 2);
    assert.equal(sent.length, 2);
    assert.ok(sent.every(body => body.to.length === 6));
    assert.ok(sent.every(body => body.html.includes("Hello everyone,")));
    assert.ok(sent.every(body => body.text.includes("calthetaxi@gmail.com") && body.text.includes("3% surcharge")));
    assert.match(sent[0].text, /deposit is due October 9, 2026/);
    assert.match(sent[1].text, /rental fee is due October 18, 2026/);
    const sentBodies = JSON.stringify(state.rows.map(row => row.payload));
    await prepareHostingEmail({ ...request, kind: "deposit_invoice", recipients: undefined });
    assert.equal(JSON.stringify(state.rows.map(row => row.payload)), sentBodies);
  } finally { state.order = originalOrder; state.revision = originalRevision; state.rows = []; }
});

test("legacy queued invoices reuse PDF bytes; previously attempted individual deliveries block a new group send", async () => {
  const originalOrder = structuredClone(state.order);
  try {
    state.rows = [];
    state.order.documents = [{ kind: "deposit_invoice", stale: false, sourceSnapshot: {}, generatedAt: "2026-10-04", payload: {} }];
    globalThis.fetch = async () => new Response("invoice bytes", { headers: { "Content-Type": "application/pdf" } });
    const input = { ...request, kind: "deposit_invoice", recipients: undefined };
    await prepareHostingEmail(input);
    const group = structuredClone(state.rows[0]);
    const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const suffix = hash({ terms: group.payload.termsHash, kind: input.kind, payments: "", refund: undefined });
    state.rows = state.revision.recipients.map(person => ({ ...structuredClone(group), id: crypto.randomUUID(), recipient: person.email, request_key: hash([state.order.id, state.revision.id, input.kind, person.email.toLowerCase(), suffix]), payload: { ...structuredClone(group.payload), body: { ...structuredClone(group.payload.body), to: [person.email], html: "old invoice copy" } } }));
    const legacy = structuredClone(state.rows);
    globalThis.fetch = async () => { throw Error("Must reuse invoice PDF"); };
    const updated = await prepareHostingEmail(input);
    assert.match(updated[0].html, /\$300\.00 is the total across all clubs/);
    assert.equal(updated.length, 1);
    assert.deepEqual(state.rows.slice(0, 2), legacy);
    assert.deepEqual(state.rows[2].payload.body.attachments, group.payload.body.attachments);
    state.rows = legacy;
    state.rows[0].status = "failed"; state.rows[0].attempted_at = "2026-10-04T12:00:00Z";
    await assert.rejects(prepareHostingEmail(input), /individual delivery history/);
  } finally { state.order = originalOrder; state.rows = []; }
});

test("deposit receipts require a received deposit and reject an undone payment at send time", async () => {
  state.rows = []; state.deposits = [];
  const input = { ...request, kind: "deposit_receipt", recipients: undefined };
  await assert.rejects(prepareHostingEmail(input), /Mark the deposit received/);
  state.deposits = [{ id: "deposit-one", order_id: state.order.id, amount: 300, paid_date: "2026-10-04", reversed_at: null }];
  const previews = await prepareHostingEmail(input);
  assert.equal(previews.length, 1);
  assert.match(previews[0].html, /Deposit payments received: \$300\.00/);
  assert.match(previews[0].attachments[0], /deposit-payment-receipt.*\.pdf/);
  const draft = hostingEmailDraft(state.order, state.revision, "deposit_receipt", 0, process.env.HOST_EMAIL_REPLY_TO, undefined, 300);
  assert.equal(draft[0].html, previews[0].html);
  state.deposits[0].reversed_at = "2026-10-04";
  globalThis.fetch = async () => { throw Error("Must not email a stale deposit receipt"); };
  const stale = await deliverHostingEmails(state.order.id, previews.map(p => p.id));
  assert.equal(stale.sent, 0); assert.match(stale.errors[0], /Payment records changed/);
  state.deposits[0].reversed_at = null;
  const calls = []; globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(init.body)); return Response.json({ id: "receipt-provider" }); };
  assert.equal((await deliverHostingEmails(state.order.id, previews.map(p => p.id))).sent, 1);
  assert.deepEqual(calls[0].to, ["one@example.test", "two@example.test"]);
  state.rows = []; state.deposits = [];
});

test("receipt style upgrades only unattempted drafts and preserves delivery IDs", async () => {
  state.rows = []; state.deposits = [{ id: "deposit-style", order_id: state.order.id, amount: 300, paid_date: "2026-10-04", reversed_at: null }];
  const input = { ...request, kind: "deposit_receipt", recipients: undefined };
  const original = await prepareHostingEmail(input);
  delete state.rows[0].payload.depositReceiptStyle;
  state.rows[0].payload.body.attachments[0].content = "old-basic-pdf";
  const upgraded = await prepareHostingEmail(input);
  assert.equal(upgraded[0].id, original[0].id);
  assert.equal(state.rows[0].payload.depositReceiptStyle, 1);
  assert.notEqual(state.rows[0].payload.body.attachments[0].content, "old-basic-pdf");
  delete state.rows[0].payload.depositReceiptStyle;
  state.rows[0].status = "failed"; state.rows[0].attempted_at = "2026-10-04T12:00:00Z";
  state.rows[0].payload.body.attachments[0].content = "frozen-attempted-pdf";
  await prepareHostingEmail(input);
  assert.equal(state.rows[0].payload.body.attachments[0].content, "frozen-attempted-pdf");
  state.rows = []; state.deposits = [];
});

test("invoice payment instructions update queued drafts without regenerating PDFs or changing retry bodies", async () => {
  const originalOrder = structuredClone(state.order);
  try {
    state.rows = [];
    state.order.documents = [{ kind: "deposit_invoice", stale: false, sourceSnapshot: {}, generatedAt: "2026-10-04", payload: {} }];
    globalThis.fetch = async () => new Response("saved invoice PDF", { headers: { "Content-Type": "application/pdf" } });
    const input = { ...request, kind: "deposit_invoice", recipients: undefined };
    const original = await prepareHostingEmail(input);
    const attachments = structuredClone(state.rows[0].payload.body.attachments);
    state.rows[0].payload.body.html = "old invoice email"; state.rows[0].payload.body.text = "old invoice email";
    globalThis.fetch = async () => { throw Error("Must reuse the saved invoice PDF"); };
    const updated = await prepareHostingEmail(input);
    assert.equal(updated[0].id, original[0].id);
    assert.match(updated[0].html, /calthetaxi@gmail\.com/);
    assert.match(state.rows[0].payload.body.text, /3% surcharge/);
    assert.deepEqual(state.rows[0].payload.body.attachments, attachments);
    state.rows[0].status = "failed"; state.rows[0].attempted_at = "2026-10-04T12:00:00Z";
    state.rows[0].payload.body.html = "frozen retry body";
    await prepareHostingEmail(input);
    assert.equal(state.rows[0].payload.body.html, "frozen retry body");
  } finally { state.order = originalOrder; state.rows = []; }
});

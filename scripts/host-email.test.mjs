import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const root = process.cwd(); const fixture = path.join(root, "scripts/host-email-fixture.ts");
const result = await build({ stdin: { contents: 'export * from "./lib/host-email"; export { hostingEmailDraft } from "./lib/host-email-draft"; export { state } from "./scripts/host-email-fixture";', resolveDir: root }, bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [{ name: "safe-transports", setup(build) {
  build.onResolve({ filter: /host-orders$|host-signing$|host-workflow$|host-backend$|email-tracking$|supabase\/admin$/ }, () => ({ path: fixture }));
  build.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" }));
  build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
} }] });
// Use a temporary module beside dependencies so pdf-lib resolves normally.
const { writeFile, unlink } = await import("node:fs/promises");
const output = path.join(root, "node_modules/.host-email-test.mjs"); await writeFile(output, result.outputFiles[0].text);
const { state, prepareHostingEmail, deliverHostingEmails, hostingEmailDraft } = await import(`file://${output.replaceAll("\\", "/")}`); await unlink(output);
process.env.RESEND_API_KEY = "test-only";
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
      const draft = hostingEmailDraft(state.order, state.revision, kind, 0, state.treasurerEmail);
      assert.deepEqual(draft.map(p => [p.recipient, p.html]), previews.map(p => [p.recipient, p.html]));
      assert.equal(previews.length, 1);
      assert.equal(previews[0].recipient, state.order.snapshot.contractSigners.map(p => p.email).join(", "));
      assert.match(previews[0].html, kind === "deposit_invoice" ? /\$300\.00 is the total across all clubs/ : /\$1400\.00 is the total across all clubs/);
      assert.match(previews[0].html, kind === "deposit_invoice" ? /deposit is due October 9, 2026/ : /rental fee is due October 18, 2026/);
      if (kind === "deposit_invoice") assert.match(previews[0].html, /October 9, 2026/);
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
  const draft = hostingEmailDraft(state.order, state.revision, "deposit_receipt", 0, state.treasurerEmail, undefined, 300);
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


test("invoice email and attachment keep the saved invoice date and preserve attempted deliveries", async () => {
  const originalOrder = structuredClone(state.order);
  try {
    state.rows = [];
    state.order.snapshot.rentalPaymentTiming = "day_before";
    state.order.snapshot.startTime = "21:30";
    state.order.snapshot.endTime = "01:00";
    state.order.documents = [{ kind: "rental_invoice", stale: false, sourceSnapshot: {}, generatedAt: "2026-10-04", payload: { due_date: "October 15, 2026" } }];
    const generated = [];
    globalThis.fetch = async (_url, init) => { generated.push(JSON.parse(init.body)); return new Response("saved invoice PDF", { headers: { "Content-Type": "application/pdf" } }); };
    const input = { ...request, kind: "rental_invoice", recipients: undefined };
    const prepared = await prepareHostingEmail(input);
    assert.match(prepared[0].html, /rental fee is due October 15, 2026/);
    assert.equal(generated[0].due_date, "October 15, 2026");
    const row = state.rows[0];
    const frozen = structuredClone(row.payload);
    row.attempted_at = "2026-10-04T12:00:00Z";
    row.status = "failed";
    state.order.documents[0].payload.due_date = "October 14, 2026";
    await prepareHostingEmail(input);
    assert.deepEqual(row.payload, frozen);
    assert.equal(generated.length, 1);
    row.status = "queued";
    row.attempted_at = null;
    const refreshed = await prepareHostingEmail(input);
    assert.match(refreshed[0].html, /rental fee is due October 14, 2026/);
    assert.equal(generated[1].due_date, "October 14, 2026");
  } finally { state.order = originalOrder; state.rows = []; }
});


test("deposit return confirmation requires a recorded return and never changes that record", async () => {
  state.rows = []; state.refund = null;
  state.rentals = [{ id: "rental-paid", order_id: state.order.id, kind: "revenue", amount: 1400, paid_date: "2020-10-15", reversed_at: null }];
  const refund = { amount: 125, date: "2020-10-17", method: "" };
  const input = { ...request, kind: "refund", refund };
  await assert.rejects(prepareHostingEmail(input), /Mark the deposit returned/);
  assert.equal(state.rows.length, 0);
  state.refund = refund;
  const previews = await prepareHostingEmail(input);
  assert.equal(previews.length, 1);
  assert.match(previews[0].html, /Deposit returned: \$125\.00 on 2020-10-17\./);
  assert.doesNotMatch(previews[0].html, /via/);
  assert.equal(previews[0].html, hostingEmailDraft(state.order, state.revision, "refund", 1400, state.treasurerEmail, refund)[0].html);
  assert.deepEqual(state.refund, refund);
  await assert.rejects(prepareHostingEmail({ ...input, refund: { ...refund, amount: 300 } }), /return changed/);
  const calls = [];
  globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(init.body)); return Response.json({ id: "return-provider" }); };
  assert.equal((await deliverHostingEmails(state.order.id, previews.map(p => p.id))).sent, 1);
  assert.deepEqual(calls[0].to, ["one@example.test", "two@example.test"]);
  assert.deepEqual(state.refund, refund);
  state.rows = []; state.rentals = []; state.refund = null;
});

test("deposit return previews survive JSONB storage without changing delivery identity or PDF bytes", async () => {
  const db = new PGlite();
  state.rows = [];
  state.rentals = [{ id: "rental-jsonb", order_id: state.order.id, kind: "revenue", amount: 1400, paid_date: "2020-10-15", reversed_at: null }];
  state.refund = { amount: 125, date: "2020-10-17", method: "" };
  try {
    const input = { ...request, kind: "refund", refund: { method: "", date: state.refund.date, amount: state.refund.amount } };
    const previews = await prepareHostingEmail(input);
    const original = structuredClone(state.rows[0]);
    const stored = await db.query("SELECT $1::jsonb AS payload", [JSON.stringify(original.payload)]);
    state.rows[0].payload = stored.rows[0].payload;
    assert.notDeepEqual(Object.keys(state.rows[0].payload.refund), Object.keys(state.refund));
    assert.deepEqual(await prepareHostingEmail(input), previews);
    assert.equal(state.rows.length, 1);
    const calls = [];
    globalThis.fetch = async (_url, init) => { calls.push({ key: init.headers["Idempotency-Key"], body: JSON.parse(init.body) }); return Response.json({ id: "return-jsonb-provider" }); };
    assert.deepEqual(await deliverHostingEmails(state.order.id, previews.map(p => p.id)), { sent: 1, skipped: 0, errors: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].key, `hosting/${original.id}`);
    assert.deepEqual(calls[0].body, original.payload.body);
    assert.equal(state.rows[0].request_key, original.request_key);
    await deliverHostingEmails(state.order.id, previews.map(p => p.id));
    assert.equal(calls.length, 1);
  } finally {
    await db.close();
    state.rows = []; state.rentals = []; state.refund = null;
  }
});

test("changed or removed deposit returns block frozen previews before any delivery attempt", async () => {
  state.rows = [];
  state.rentals = [{ id: "rental-refund-changed", order_id: state.order.id, kind: "revenue", amount: 1400, paid_date: "2020-10-15", reversed_at: null }];
  const refund = { amount: 125, date: "2020-10-17", method: "" };
  state.refund = refund;
  try {
    const input = { ...request, kind: "refund", refund };
    const previews = await prepareHostingEmail(input);
    const frozen = structuredClone(state.rows);
    globalThis.fetch = async () => { throw Error("Changed deposit returns must not send"); };
    for (const changed of [{ ...refund, amount: 300 }, { ...refund, date: "2020-10-18" }, { ...refund, method: "Zelle" }, null]) {
      state.refund = changed;
      await assert.rejects(prepareHostingEmail(input), /return changed|Mark the deposit returned/);
      assert.deepEqual(await deliverHostingEmails(state.order.id, previews.map(p => p.id)), { sent: 0, skipped: 0, errors: ["The deposit return changed. Prepare a fresh preview."] });
      assert.deepEqual(state.rows, frozen);
    }
  } finally {
    state.rows = []; state.rentals = []; state.refund = null;
  }
});

test("new messages use the managed treasurer and stored messages retain their reply address", async () => {
  state.rows = [];
  state.cancelled = false;
  state.revision.state = "awaiting_signatures";
  state.revision.recipients[0].status = "NOT_SIGNED";
  state.treasurerEmail = "new-treasurer@example.test";
  const previews = await prepareHostingEmail(request);
  assert.equal(state.rows[0].payload.body.reply_to, state.treasurerEmail);
  state.treasurerEmail = "";
  const reopened = await prepareHostingEmail(request);
  assert.equal(reopened[0].id, previews[0].id);
  assert.equal(reopened[0].replyTo, "new-treasurer@example.test");
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json({ id: "managed-contact-test" });
  };
  const delivered = await deliverHostingEmails(state.order.id, previews.map(preview => preview.id));
  assert.equal(delivered.sent, 1);
  assert.equal(sent[0].reply_to, "new-treasurer@example.test");
  state.rows = [];
  await assert.rejects(prepareHostingEmail(request), /Assign a treasurer with an email in Users/);
  state.treasurerEmail = "host@example.test";
});

test("rental invoice labels update only unattempted previews and preserve amounts and delivery identity", async () => {
  const originalOrder = structuredClone(state.order);
  try {
    state.rows = [];
    const line_items = [
      { description: "Base rental — Theta Xi Fraternity House", amount: "150.00" },
      { description: "Capacity fee — 200 guests", amount: "930.00" },
      { description: "Alcohol", amount: "100.00" },
      { description: "Property protection — Average", amount: "220.00" },
    ];
    state.order.documents = [{ kind: "rental_invoice", stale: false, sourceSnapshot: {}, generatedAt: "2026-10-04", payload: { line_items } }];
    const generated = [];
    globalThis.fetch = async (_url, init) => {
      generated.push(JSON.parse(init.body));
      return new Response("simplified rental PDF", { headers: { "Content-Type": "application/pdf" } });
    };
    const input = { ...request, kind: "rental_invoice", recipients: undefined };
    const original = await prepareHostingEmail(input);
    assert.deepEqual(generated[0].line_items, [
      { description: "Base rental", amount: "150.00" },
      { description: "Capacity fee", amount: "1150.00" },
      { description: "Alcohol surcharge", amount: "100.00" },
    ]);
    assert.deepEqual(state.order.documents[0].payload.line_items, line_items);
    state.rows[0].payload.rentalInvoiceStyle = 1;
    state.rows[0].payload.body.attachments[0].content = "old detailed PDF";
    const updated = await prepareHostingEmail(input);
    assert.equal(updated[0].id, original[0].id);
    assert.equal(state.rows[0].payload.rentalInvoiceStyle, 2);
    assert.equal(generated.length, 2);
    assert.notEqual(state.rows[0].payload.body.attachments[0].content, "old detailed PDF");
    await prepareHostingEmail(input);
    assert.equal(generated.length, 2);
    state.rows[0].payload.rentalInvoiceStyle = 1;
    state.rows[0].attempted_at = "2026-10-04T12:00:00Z";
    const frozen = structuredClone(state.rows[0].payload);
    for (const status of ["queued", "failed", "sent"]) {
      state.rows[0].status = status;
      await prepareHostingEmail(input);
      assert.deepEqual(state.rows[0].payload, frozen);
    }
    assert.equal(generated.length, 2);
  } finally { state.order = originalOrder; state.rows = []; }
});


test("rental receipts upgrade queued previews in place and freeze all attempted deliveries", async () => {
  state.rows = [];
  state.rentals = [{ id: "rental-style", order_id: state.order.id, kind: "revenue", amount: 1400, paid_date: "2026-10-19", reversed_at: null }];
  const input = { ...request, kind: "receipt", recipients: undefined };
  const original = await prepareHostingEmail(input);
  assert.equal(original.length, 1);
  assert.equal(state.rows[0].payload.rentalReceiptStyle, 1);
  const identity = state.rows.map(row => ({ id: row.id, key: row.request_key, recipient: row.recipient }));
  const bodies = state.rows.map(row => ({ ...row.payload.body, attachments: undefined }));
  state.rows.forEach(row => {
    delete row.payload.rentalReceiptStyle;
    row.payload.body.attachments[0].content = "old-basic-rental-pdf";
  });
  const refreshed = await prepareHostingEmail(input);
  assert.deepEqual(refreshed.map(row => row.id), original.map(row => row.id));
  assert.deepEqual(state.rows.map(row => ({ id: row.id, key: row.request_key, recipient: row.recipient })), identity);
  assert.deepEqual(state.rows.map(row => ({ ...row.payload.body, attachments: undefined })), bodies);
  assert.ok(state.rows.every(row => row.payload.rentalReceiptStyle === 1 && row.payload.body.attachments[0].content !== "old-basic-rental-pdf"));
  state.rows.forEach(row => {
    delete row.payload.rentalReceiptStyle;
    row.payload.body.attachments[0].content = "frozen-rental-pdf";
    row.attempted_at = "2026-10-19T12:00:00Z";
  });
  for (const status of ["queued", "failed", "sent"]) {
    state.rows.forEach(row => { row.status = status; });
    const frozen = structuredClone(state.rows);
    await prepareHostingEmail(input);
    assert.deepEqual(state.rows, frozen);
  }
  state.rows = [];
  state.rentals = [];
});

test("rental receipts use one shared email and preserve individual sent or attempted history", async () => {
  state.rows = [];
  state.rentals = [{ id: "rental-group", order_id: state.order.id, kind: "revenue", amount: 1400, paid_date: "2026-10-19", reversed_at: null }];
  const input = { ...request, kind: "receipt", recipients: undefined };
  const grouped = await prepareHostingEmail(input);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].html, hostingEmailDraft(state.order, state.revision, "receipt", 1400, state.treasurerEmail)[0].html);
  const calls = [];
  globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(init.body)); return Response.json({ id: "rental-group-provider" }); };
  assert.equal((await deliverHostingEmails(state.order.id, grouped.map(p => p.id))).sent, 1);
  assert.deepEqual(calls[0].to, ["one@example.test", "two@example.test"]);
  const group = structuredClone(state.rows[0]);
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const suffix = hash({ terms: group.payload.termsHash, kind: "receipt", payments: group.payload.paymentsHash, refund: undefined });
  const legacy = state.revision.recipients.map(person => ({ ...structuredClone(group), id: crypto.randomUUID(), request_key: hash([state.order.id, state.revision.id, "receipt", person.email.toLowerCase(), suffix]), recipient: person.email, payload: { ...structuredClone(group.payload), sharedFinancialEmail: undefined, body: { ...structuredClone(group.payload.body), to: [person.email] } } }));
  for (const status of ["queued", "sent", "failed"]) {
    state.rows = structuredClone(legacy);
    state.rows.forEach(row => { row.status = status; row.attempted_at = status === "queued" ? null : "2026-10-19T12:00:00Z"; });
    const frozen = structuredClone(state.rows);
    const archived = await prepareHostingEmail(input);
    assert.equal(archived.length, 2);
    assert.deepEqual(state.rows, frozen);
    assert.deepEqual(archived.map(p => p.id), frozen.map(row => row.id));
  }
  state.rows = []; state.rentals = [];
});


test("deposit return PDFs upgrade queued previews while keeping delivery identity and archived bytes", async () => {
  state.rows = [];
  state.rentals = [{ id: "rental-refund-style", order_id: state.order.id, kind: "revenue", amount: 1400, paid_date: "2026-10-19", reversed_at: null }];
  state.refund = { amount: 125, date: "2020-10-17", method: "" };
  const input = { ...request, kind: "refund", refund: state.refund, recipients: undefined };
  const original = await prepareHostingEmail(input);
  assert.equal(state.rows[0].payload.depositReturnStyle, 1);
  assert.match(original[0].attachments[0], /deposit-return-confirmation.*\.pdf/);
  const identity = { id: state.rows[0].id, key: state.rows[0].request_key, recipient: state.rows[0].recipient };
  const body = { ...state.rows[0].payload.body, attachments: undefined };
  delete state.rows[0].payload.depositReturnStyle;
  state.rows[0].payload.body.attachments[0].content = "old-return-pdf";
  const upgraded = await prepareHostingEmail(input);
  assert.equal(upgraded[0].id, original[0].id);
  assert.deepEqual({ id: state.rows[0].id, key: state.rows[0].request_key, recipient: state.rows[0].recipient }, identity);
  assert.deepEqual({ ...state.rows[0].payload.body, attachments: undefined }, body);
  assert.notEqual(state.rows[0].payload.body.attachments[0].content, "old-return-pdf");
  assert.deepEqual(state.refund, { amount: 125, date: "2020-10-17", method: "" });
  delete state.rows[0].payload.depositReturnStyle;
  state.rows[0].payload.body.attachments[0].content = "archived-return-pdf";
  state.rows[0].attempted_at = "2026-10-19T12:00:00Z";
  for (const status of ["queued", "sent", "failed"]) {
    state.rows[0].status = status;
    const frozen = structuredClone(state.rows);
    await prepareHostingEmail(input);
    assert.deepEqual(state.rows, frozen);
  }
  const group = structuredClone(state.rows[0]);
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const suffix = hash({ terms: group.payload.termsHash, kind: "refund", payments: group.payload.paymentsHash, refund: input.refund });
  const legacy = state.revision.recipients.map(person => ({ ...structuredClone(group), id: crypto.randomUUID(), request_key: hash([state.order.id, state.revision.id, "refund", person.email.toLowerCase(), suffix]), recipient: person.email, payload: { ...structuredClone(group.payload), sharedFinancialEmail: undefined, body: { ...structuredClone(group.payload.body), to: [person.email] } } }));
  state.rows = structuredClone(legacy);
  state.rows.forEach(row => { row.status = "queued"; row.attempted_at = null; });
  const legacyIds = state.rows.map(row => row.id);
  const previews = await prepareHostingEmail(input);
  assert.deepEqual(previews.map(row => row.id), legacyIds);
  assert.equal(state.rows.length, legacy.length);
  assert.ok(state.rows.every(row => row.payload.depositReturnStyle === 1 && row.payload.body.attachments[0].content !== "archived-return-pdf"));
  state.rows = structuredClone(legacy);
  const frozen = structuredClone(state.rows);
  await prepareHostingEmail(input);
  assert.deepEqual(state.rows, frozen);
  state.rows = []; state.rentals = []; state.refund = null;
});

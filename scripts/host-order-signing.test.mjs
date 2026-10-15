import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render the production components before any browser effects or history fetch.
// Use the existing local preview adapters so no live services can be called.
const root = path.resolve(import.meta.dirname, "..");
const preview = path.join(root, "scripts/host-preview");
const result = await build({
  stdin: { contents: `
    export { default as OrderSigning } from "./app/(admin)/host/orders/[id]/OrderSigning";
    export { default as SigningPanel } from "./app/(admin)/host/documents/SigningPanel";
    export { default as OrderTimeline } from "./app/(admin)/host/orders/[id]/OrderTimeline";
    export { default as AgreementSummary } from "./components/host/AgreementSummary";
    export { default as PaymentMessagePanel } from "./app/(admin)/host/documents/PaymentMessagePanel";
    export { paymentSchedule, orderInvoiceDueDate } from "./lib/host-payment-schedule";
    export { defaultDocuments } from "./lib/host-order-documents";
    export { orderSnapshot } from "./lib/host-order-snapshot";
    export { sharedStateFromSnapshot } from "./lib/host-state-model";
    export { exampleDraft } from "./scripts/host-preview/data";
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react/*"],
  alias: { "@": root, "next/link": path.join(preview, "link.tsx"), "next/navigation": path.join(preview, "navigation.tsx") },
  plugins: [{ name: "local-actions", setup(build) {
    build.onResolve({ filter: /(^|\/)actions$/ }, () => ({ path: path.join(preview, "orders-actions.ts") }));
    build.onResolve({ filter: /\/signing-actions$/ }, () => ({ path: path.join(preview, "signing-actions.ts") }));
    build.onResolve({ filter: /\/email-actions$/ }, () => ({ path: path.join(preview, "email-actions.ts") }));
    build.onResolve({ filter: /^(server-only|@supabase\/|next\/headers|next\/cache)/ }, args => ({ errors: [{ text: `Live dependency blocked: ${args.path}` }] }));
  } }],
});
const compiled = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${result.outputFiles[0].text}\n})`)(createRequire(path.join(root, "package.json")), compiled, compiled.exports);
const { OrderSigning, SigningPanel, OrderTimeline, AgreementSummary, PaymentMessagePanel, paymentSchedule, orderInvoiceDueDate, defaultDocuments, orderSnapshot, sharedStateFromSnapshot, exampleDraft } = compiled.exports;
const data = exampleDraft();
const order = { id: "ord_test", clubName: data.clubs.join(", "), eventDate: data.eventDate, rentalPrice: 1400, depositAmount: 300, snapshot: data, documents: [], updatedAt: "2026-10-01T18:00:00Z" };
const revision = { id: "sig_test", order_id: order.id, revision: 1, state: "awaiting_signatures", signedCount: 0, totalCount: 5, files: { original: true, completed: false, audit: false }, recipients: data.contractSigners.map(person => ({ name: person.fullName, email: person.email, status: "NOT_SIGNED", link: "https://example.test/sign" })) };

test("saved order first render shows existing signer progress without editing controls", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order, revisions: [revision] }));
  assert.match(html, /0 of 5 signed/);
  for (const person of revision.recipients) assert.ok(html.includes(person.name));
  assert.match(html, /Copy signing link/);
  assert.doesNotMatch(html, /<input|Review contract|Prepare replacement|Edit people/);
});

test("saved order without signing history directs edits into the separate draft", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order, revisions: [] }));
  assert.match(html, /Use Edit order/);
  assert.doesNotMatch(html, /<input|Review contract|Prepare replacement/);
});

test("unavailable signing history never exposes the saved order editor", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order }));
  assert.match(html, /Loading signing status/);
  assert.doesNotMatch(html, /<input|Review contract|Prepare replacement/);
});

test("draft preparation waits for existing history but remains available for a new order", () => {
  const props = { data, update() {}, saveOrder: async () => null, reviewedOrderVersion: () => undefined };
  const existing = renderToStaticMarkup(createElement(SigningPanel, { ...props, orderId: order.id }));
  assert.match(existing, /Loading signing status/);
  assert.doesNotMatch(existing, /Review contract<\/button>|Edit people/);
  const fresh = renderToStaticMarkup(createElement(SigningPanel, { ...props, orderId: "" }));
  assert.match(fresh, /Review contract/);
  assert.match(fresh, /Edit people/);
});

test("timeline first render preserves pending signer progress without exposing the signer editor", () => {
  const pending = { ...revision, created_at: "2026-10-01T18:00:00Z", envelope_id: "envelope_existing" };
  const html = renderToStaticMarkup(createElement(OrderTimeline, { order, revisions: [pending], workflow: { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: null, deliveries: [], refund: null }, today: "2026-10-04", emailConfigured: true, rentalPaid: 0, permitPaid: 0, permitTotal: 125 }));
  assert.match(html, /0 of 5 signed/);
  assert.match(html, /Remind unsigned signers/);
  for (const person of pending.recipients) assert.ok(html.includes(person.name));
  assert.doesNotMatch(html, /Edit people|Review contract|Prepare replacement|Mark sent|Undo sent/);
});


test("saved draft can review its contract directly without editing its representatives", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order, revisions: [], reviewContract: true }));
  assert.match(html, /Review contract/);
  assert.match(html, /Edit representatives/);
  assert.doesNotMatch(html, /<input|Approve contract|Send email|Prepare replacement/);
});

test("downloaded contracts do not mark the timeline agreement as approved", () => {
  const draft = { ...order, documents: [{ kind: "contract" }] };
  const html = renderToStaticMarkup(createElement(OrderTimeline, { order: draft, revisions: [], workflow: { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: null, deliveries: [], refund: null }, today: "2026-10-04", emailConfigured: true, rentalPaid: 0, permitPaid: 0, permitTotal: 125 }));
  assert.match(html, /Approve contract<span class="sr-only">, pending/);
  assert.match(html, /Review contract/);
  assert.match(html, /Draft until sent/);
  assert.doesNotMatch(html, /Review emails<|Send email/);
});

test("approved unsent contracts resume email review without exposing contract preparation", () => {
  const approved = { ...revision, created_at: "2026-10-05T18:00:00Z", envelope_id: "envelope_existing" };
  const html = renderToStaticMarkup(createElement(OrderTimeline, { order, revisions: [approved], workflow: { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: null, deliveries: [], refund: null }, today: "2026-10-04", emailConfigured: true, rentalPaid: 0, permitPaid: 0, permitTotal: 125 }));
  assert.match(html, /Review emails/);
  assert.match(html, /Draft until sent/);
  assert.doesNotMatch(html, /Review contract<|Prepare replacement/);
});


test("new and existing contracts retain their own payment dates across the hosting views", () => {
  const future = { ...data, eventDate: "2026-10-30", startTime: "21:30", endTime: "01:00" };
  const legacySnapshot = { ...future };
  delete legacySnapshot.rentalPaymentTiming;
  const legacy = sharedStateFromSnapshot(legacySnapshot);
  const props = { revisions: [], workflow: { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: null, deliveries: [], refund: null }, today: "2026-10-14", emailConfigured: true, rentalPaid: 0, depositPaid: 0, permitPaid: 0, permitTotal: 0 };
  for (const [terms, expectedDate, beforeEvent] of [[future, "October 29, 2026", true], [legacy, "November 2, 2026", false]]) {
    const saved = { ...order, eventDate: terms.eventDate, snapshot: orderSnapshot(terms) };
    const baseline = JSON.stringify(saved);
    const payloads = defaultDocuments(saved).payloads;
    assert.equal(payloads.rental_invoice.due_date, expectedDate);
    assert.equal(payloads.contract.rental_payment_timing, terms.rentalPaymentTiming);
    const summary = renderToStaticMarkup(createElement(AgreementSummary, { data: terms }));
    assert.ok(summary.includes(expectedDate));
    const timeline = renderToStaticMarkup(createElement(OrderTimeline, { ...props, order: saved }));
    assert.ok(timeline.includes(expectedDate));
    assert.equal(timeline.indexOf("Send rental invoice") < timeline.indexOf("Event held"), beforeEvent);
    assert.equal(timeline.indexOf("Receive rental payment") < timeline.indexOf("Event held"), beforeEvent);
    assert.ok(timeline.indexOf("Return deposit") > timeline.indexOf("Event held"));
    const schedule = paymentSchedule(terms);
    const message = renderToStaticMarkup(createElement(PaymentMessagePanel, { eventDate: terms.eventDate, depositAmount: "300", rentalAmount: 1400, depositDueDate: schedule.depositDueDate, rentalDueDate: schedule.rentalDueDate, rentalPaymentTiming: terms.rentalPaymentTiming }));
    assert.equal(message.includes("After the event and receipt"), beforeEvent);
    assert.equal(message.indexOf("full rental fee due") < message.indexOf("Event at Theta Xi"), beforeEvent);
    assert.equal(JSON.stringify(saved), baseline);
  }
  const archived = { ...order, documents: [{ kind: "rental_invoice", stale: false, sourceSnapshot: legacySnapshot, generatedAt: "2026-10-05", payload: { due_date: "November 3, 2026" } }] };
  assert.equal(orderInvoiceDueDate(archived, "rental_invoice"), "November 3, 2026");
  const earlyInvoice = { ...order, eventDate: legacy.eventDate, snapshot: orderSnapshot(legacy), documents: [{ ...archived.documents[0], payload: { due_date: "October 29, 2026" } }] };
  const timeline = renderToStaticMarkup(createElement(OrderTimeline, { ...props, order: earlyInvoice }));
  assert.ok(timeline.indexOf("Send rental invoice") > timeline.indexOf("Event held"));
  assert.match(timeline, /Contract due November 2, 2026 · Invoice due October 29, 2026/);
});

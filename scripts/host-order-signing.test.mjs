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
const { OrderSigning, SigningPanel, OrderTimeline, exampleDraft } = compiled.exports;
const data = exampleDraft();
const order = { id: "ord_test", clubName: data.clubs.join(", "), eventDate: data.eventDate, rentalPrice: 1400, depositAmount: 300, snapshot: data, documents: [], updatedAt: "2026-10-01T18:00:00Z" };
const revision = { id: "sig_test", order_id: order.id, revision: 1, state: "awaiting_signatures", signedCount: 0, totalCount: 5, files: { original: true, completed: false, audit: false }, recipients: data.contractSigners.map(person => ({ name: person.fullName, email: person.email, status: "NOT_SIGNED", link: "https://example.test/sign" })) };

test("saved order first render shows existing signer progress without editing controls", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order, revisions: [revision] }));
  assert.match(html, /0 of 5 signed/);
  for (const person of revision.recipients) assert.ok(html.includes(person.name));
  assert.match(html, /Copy signing link/);
  assert.doesNotMatch(html, /<input|Preview contract|Prepare replacement|Edit people/);
});

test("saved order without signing history directs edits into the separate draft", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order, revisions: [] }));
  assert.match(html, /Use Edit order/);
  assert.doesNotMatch(html, /<input|Preview contract|Prepare replacement/);
});

test("unavailable signing history never exposes the saved order editor", () => {
  const html = renderToStaticMarkup(createElement(OrderSigning, { order }));
  assert.match(html, /Loading signing status/);
  assert.doesNotMatch(html, /<input|Preview contract|Prepare replacement/);
});

test("draft preparation waits for existing history but remains available for a new order", () => {
  const props = { data, update() {}, saveOrder: async () => null, reviewedOrderVersion: () => undefined };
  const existing = renderToStaticMarkup(createElement(SigningPanel, { ...props, orderId: order.id }));
  assert.match(existing, /Loading signing status/);
  assert.doesNotMatch(existing, /Preview contract|Edit people/);
  const fresh = renderToStaticMarkup(createElement(SigningPanel, { ...props, orderId: "" }));
  assert.match(fresh, /Preview contract/);
  assert.match(fresh, /Edit people/);
});

test("timeline first render preserves pending signer progress without exposing the signer editor", () => {
  const pending = { ...revision, created_at: "2026-10-01T18:00:00Z", envelope_id: "envelope_existing" };
  const html = renderToStaticMarkup(createElement(OrderTimeline, { order, revisions: [pending], workflow: { activatedAt: "2026-10-04T12:00:00Z", cancelledAt: null, deliveries: [], refund: null }, today: "2026-10-04", emailConfigured: true, rentalPaid: 0, permitPaid: 0, permitTotal: 125 }));
  assert.match(html, /0 of 5 signed/);
  assert.match(html, /Remind unsigned signers/);
  for (const person of pending.recipients) assert.ok(html.includes(person.name));
  assert.doesNotMatch(html, /Edit people|Preview contract|Prepare replacement|Mark sent|Undo sent/);
});

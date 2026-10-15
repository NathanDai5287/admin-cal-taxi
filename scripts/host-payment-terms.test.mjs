import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
const root = path.resolve(import.meta.dirname, "..");
const terms = "day_before";
const compiled = await build({
  stdin: { contents: `export * from "./lib/host-payment-schedule";
    export * from "./lib/host-state-model";
    export * from "./lib/host-order-documents";
    export * from "./lib/host-order-snapshot";`, resolveDir: root },
  bundle: true, write: false, platform: "node", format: "cjs", alias: { "@": root },
});
const compiledModule = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled.outputFiles[0].text}\n})`)(createRequire(path.join(root, "package.json")), compiledModule, compiledModule.exports);
const { EMPTY_STATE, sharedStateFromSnapshot, orderSnapshot, defaultDocuments,
  paymentSchedule, formatRentalDeadline, contractDraftPaymentTiming, orderInvoiceDueDate } = compiledModule.exports;
const event = { ...structuredClone(EMPTY_STATE), clubs: ["Sample Club"], eventDate: "2026-10-16",
  finalPrice: "1400", depositAmount: "300", numGuests: "200", startTime: "20:00", endTime: "01:00",
  overrides: { finalPrice: true, depositAmount: true, maxGuests: false } };
const order = { id: "ord_sample", clubName: "Sample Club", eventDate: event.eventDate,
  rentalPrice: 1400, depositAmount: 300, documents: [], snapshot: event };

test("new contracts carry the advance deadline while historical snapshots retain their terms", () => {
  const legacy = structuredClone(event); delete legacy.rentalPaymentTiming;
  const original = structuredClone(legacy);
  const loaded = sharedStateFromSnapshot(legacy);
  assert.equal(loaded.rentalPaymentTiming, "after_conclusion");
  assert.deepEqual(legacy, original);
  const oldDefaults = defaultDocuments({ ...order, snapshot: legacy });
  const newDefaults = defaultDocuments(order);
  assert.equal(oldDefaults.payloads.contract.rental_payment_timing, "after_conclusion");
  assert.equal(oldDefaults.payloads.rental_invoice.due_date, "October 19, 2026");
  assert.equal(newDefaults.payloads.contract.rental_payment_timing, terms);
  assert.equal(newDefaults.payloads.rental_invoice.due_date, "October 15, 2026 at 11:59 p.m. Pacific Time");
  assert.equal(newDefaults.payloads.deposit_invoice.due_date, oldDefaults.payloads.deposit_invoice.due_date);
  assert.equal(sharedStateFromSnapshot(orderSnapshot(event)).rentalPaymentTiming, terms);
});

test("day-before deadlines use calendar dates across year, leap-day, and Pacific DST boundaries", () => {
  for (const [eventDate, expected] of [["2027-01-01", "2026-12-31"], ["2028-03-01", "2028-02-29"],
    ["2026-03-09", "2026-03-08"], ["2026-11-02", "2026-11-01"]]) {
    const schedule = paymentSchedule({ ...event, eventDate });
    assert.equal(schedule.rentalDueDate, expected);
    assert.match(formatRentalDeadline(schedule.rentalDueDate, terms), /at 11:59 p\.m\. Pacific Time$/);
  }
});

test("only unissued contract drafts automatically adopt advance payment", () => {
  const legacy = { ...order, snapshot: {} };
  assert.equal(contractDraftPaymentTiming(legacy, []), terms);
  assert.equal(contractDraftPaymentTiming(legacy), "after_conclusion");
  assert.equal(contractDraftPaymentTiming(legacy, [{ state: "preview", envelope_id: null }]), terms);
  for (const state of ["awaiting_signatures", "signed", "preparing_completed_copy", "creation_uncertain", "creating", "activating"]) {
    assert.equal(contractDraftPaymentTiming(legacy, [{ state, envelope_id: null }]), "after_conclusion");
  }
  assert.equal(contractDraftPaymentTiming({ ...legacy, documents: [{ kind: "contract" }] }, []), "after_conclusion");
});

test("an issued invoice keeps its exact due text and is never retroactively reformatted", () => {
  const saved = { ...order, documents: [{ kind: "rental_invoice", stale: false, sourceSnapshot: event,
    generatedAt: "2026-10-01", payload: { due_date: "October 15, 2026" } }] };
  assert.equal(orderInvoiceDueDate(saved, "rental_invoice"), "October 15, 2026");
  assert.equal(orderInvoiceDueDate(order, "rental_invoice"), "October 15, 2026 at 11:59 p.m. Pacific Time");
});

const serviceBuild = await build({
  stdin: { contents: `export { prepareSigning } from "./lib/host-signing";
    export { POST as generateContract } from "./app/api/host/generate/[...path]/route";`, resolveDir: root },
  bundle: true, write: false, platform: "node", format: "cjs", alias: { "@": root }, external: ["next/server"],
  plugins: [{ name: "offline-service-config", setup(build) {
    build.onResolve({ filter: /host-backend$|reimbursements\/auth$|^server-only$/ }, args => ({ path: args.path, namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      export function backendOrigin() { return "https://backend.example.test"; }
      export function backendKey() { return "test-key"; }
      export class BackendConfigError extends Error {}
      export function hasAppAccess() { return true; }
      export async function getSessionProfile() { return { profile: { role: "admin" } }; }
    ` }));
  } }],
});
const services = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${serviceBuild.outputFiles[0].text}\n})`)(createRequire(path.join(root, "package.json")), services, services.exports);

test("new contract previews require the backend to acknowledge the deadline before links can be created", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ revision: { id: "preview-only" } });
    await assert.rejects(services.exports.prepareSigning("order", { rental_payment_timing: terms }, "request-key", ""), /No signing links were created/);
    assert.equal((await services.exports.prepareSigning("order", {}, "legacy-key", "")).id, "preview-only");
    globalThis.fetch = async () => Response.json({ revision: { id: "preview-new", rentalPaymentTiming: terms } });
    assert.equal((await services.exports.prepareSigning("order", { rental_payment_timing: terms }, "request-key", "")).id, "preview-new");
  } finally { globalThis.fetch = originalFetch; }
});

test("PDF proxy refuses old backend wording for new contracts but permits historical payloads", async () => {
  const originalFetch = globalThis.fetch;
  const request = payload => new Request("https://admin.example.test/api/host/generate/contract", {
    method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" },
  });
  try {
    globalThis.fetch = async () => new Response("old PDF", { headers: { "Content-Type": "application/pdf" } });
    const rejected = await services.exports.generateContract(request({ rental_payment_timing: terms }), { params: Promise.resolve({ path: ["contract"] }) });
    assert.equal(rejected.status, 502);
    assert.equal((await rejected.json()).error, "payment_terms_unavailable");
    const legacy = await services.exports.generateContract(request({}), { params: Promise.resolve({ path: ["contract"] }) });
    assert.equal(legacy.status, 200);
    assert.equal(await legacy.text(), "old PDF");
    globalThis.fetch = async () => new Response("new PDF", { headers: { "Content-Type": "application/pdf", "X-Rental-Payment-Timing": terms } });
    const current = await services.exports.generateContract(request({ rental_payment_timing: terms }), { params: Promise.resolve({ path: ["contract"] }) });
    assert.equal(current.status, 200);
    assert.equal(await current.text(), "new PDF");
  } finally { globalThis.fetch = originalFetch; }
});

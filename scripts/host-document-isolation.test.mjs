import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual pure TypeScript modules with browser storage doubles.
const root = path.resolve(import.meta.dirname, "..");
const modules = new Map();
function load(name) {
  const filename = path.resolve(root, name.endsWith(".ts") ? name : name + ".ts");
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(specifier => load(path.relative(root, path.resolve(path.dirname(filename), specifier))), module, module.exports);
  return module.exports;
}
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
const model = load("lib/host-state-model");
const drafts = load("lib/host-draft-storage");
const snapshots = load("lib/host-order-snapshot");
function reset() { globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); }


test("drafts have separate immutable keys even when parties and dates match", () => {
  reset(); const state = { ...structuredClone(model.EMPTY_STATE), clubs: ["Controlled Club"], eventDate: "2026-10-16" };
  const a = drafts.beginDraft(state); const b = drafts.beginDraft(state);
  assert.notEqual(a, b); assert.notEqual(drafts.readDraft(a).documentContextId, drafts.readDraft(b).documentContextId);
  drafts.retireDraft(a); assert.deepEqual(drafts.readDraft(b).clubs, ["Controlled Club"]);
  assert.equal(drafts.activeDraft(), b);
});

test("snapshot normalization drops foreign bookkeeping and derived fields", () => {
  const normalized = model.sharedStateFromSnapshot({ ...model.EMPTY_STATE, currentOrderId: "foreign", pricingBreakdown: { total: 9000 }, injected: "foreign", areas: { living_room: true }, contractSigners: [] });
  assert.equal(normalized.currentOrderId, ""); assert.equal("injected" in normalized, false); assert.equal("pricingBreakdown" in normalized, false);
  normalized.areas.backyard = true; assert.equal(model.EMPTY_STATE.areas.backyard, false);
  const saved = snapshots.orderSnapshot({ ...normalized, documentContextId: "owned", finalPrice: "1400", overrides: { ...normalized.overrides, finalPrice: true } });
  assert.equal(saved.rentalPrice, "1400"); assert.equal("currentOrderId" in saved, false); assert.equal(saved.documentContextId, "owned");
});

test("safe explicit legacy edit stays attached; ambiguous old attachment does not", () => {
  reset(); localStorage.setItem("admin.host.shared.v1", JSON.stringify({ ...model.EMPTY_STATE, currentOrderId: "ord_controlled", orderDraftIntent: "edit", clubs: ["Controlled Club"] }));
  const id = drafts.activeDraft(); assert.equal(drafts.readDraft(id).currentOrderId, "ord_controlled"); assert.equal(drafts.activeDraft(), id); assert.equal(localStorage.getItem("admin.host.shared.v1"), null);
  reset(); localStorage.setItem("admin.host.shared.v1", JSON.stringify({ ...model.EMPTY_STATE, currentOrderId: "ord_old", clubs: ["New Club"] }));
  assert.equal(drafts.readDraft(drafts.activeDraft()).currentOrderId, "");
});

test("migration does not delete the only draft when persistence fails", () => {
  reset(); const key = "admin.host.shared.v1"; localStorage.setItem(key, JSON.stringify({ clubs: ["Unsaved Club"] }));
  localStorage.setItem = () => { throw new Error("Controlled quota failure"); };
  assert.throws(() => drafts.activeDraft(), /quota/); assert.notEqual(localStorage.getItem(key), null);
});


test("legacy manual pricing survives migration and partial historical pricing is rejected", () => {
  reset(); localStorage.setItem("admin.host.shared.v1", JSON.stringify({ clubs: ["Controlled Club"], finalPrice: "1400", depositAmount: "300", maxGuests: "250" }));
  const state = drafts.readDraft(drafts.activeDraft()); assert.deepEqual(state.overrides, { finalPrice: true, depositAmount: true, maxGuests: true });
  assert.equal(snapshots.orderSnapshot(state).rentalPrice, "1400");
  assert.equal(load("lib/host-saved-pricing").savedPricing({ base: 150, capacity: 400 }), null);
});

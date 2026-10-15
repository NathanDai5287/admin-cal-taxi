import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({ stdin: { contents: 'export * from "./lib/host-contacts"; export * from "./lib/host-state-model"; export { missingFields } from "./lib/host-documents";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node" });
const { officerContactDefaults, EMPTY_STATE, missingFields } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const contacts = [
  { id: "treasurer", name: "Alex Example", contact: "alex@example.test", email: "alex@example.test", executiveRoles: ["treasurer"] },
  { id: "president", name: "Casey Example", contact: "casey@example.test", email: "casey@example.test", executiveRoles: ["president"] },
];

test("new drafts use assigned officers without changing the source", () => {
  const draft = structuredClone(EMPTY_STATE);
  assert.deepEqual(officerContactDefaults(draft, contacts), {
    treasurerName: contacts[0].name, treasurerContact: contacts[0].contact,
    presidentName: contacts[1].name, presidentContact: contacts[1].contact,
  });
  assert.deepEqual(draft, EMPTY_STATE);
});

test("saved orders and partially entered contacts remain unchanged", () => {
  assert.deepEqual(officerContactDefaults({ ...EMPTY_STATE, currentOrderId: "saved-order" }, contacts), {});
  assert.deepEqual(officerContactDefaults({ ...EMPTY_STATE, loadedOrderIdentity: "saved-version" }, contacts), {});
  assert.deepEqual(officerContactDefaults({ ...EMPTY_STATE, treasurerName: "Previous Treasurer", presidentContact: "previous@example.test" }, contacts), {});
});

test("unassigned offices do not invent a contact", () => {
  assert.deepEqual(officerContactDefaults(EMPTY_STATE, []), {});
});

test("incomplete people do not fill empty contacts", () => {
  const incomplete = contacts.map(person => ({ ...person, name: "" }));
  assert.deepEqual(officerContactDefaults(EMPTY_STATE, incomplete), {});
});

test("new invoice generation needs contacts without changing historical requirements", () => {
  const labels = missingFields("deposit_invoice", EMPTY_STATE, {});
  assert.ok(labels.some(label => label.startsWith("treasurer name")));
  assert.ok(labels.some(label => label.startsWith("treasurer email")));
  const historical = missingFields("deposit_invoice", { ...EMPTY_STATE, currentOrderId: "existing" }, {});
  assert.ok(historical.every(label => !label.startsWith("treasurer")));
});

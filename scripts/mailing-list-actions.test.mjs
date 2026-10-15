import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["app/(admin)/mailing-list/actions.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "action-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(next\/cache|@\/lib\/reimbursements\/auth|@\/lib\/reimbursements\/supabase\/admin)$/ }, (args) => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: args.path === "next/cache"
      ? "export const revalidatePath = p => globalThis.mailingTest.invalidations.push(p);"
      : args.path.endsWith("/auth") ? "export const requireAdmin = async () => { if (!globalThis.mailingTest.admin) throw new Error('Unauthorized'); };"
      : "export const createAdminClient = () => { globalThis.mailingTest.clients++; return globalThis.mailingTest.client; };" }));
  } }],
});
const { saveContact, importContacts, deleteContact } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const contact = { first_name: "Alex", last_name: "Smith", email: "ALEX@example.com", phone: "" };
const id = "e5de54f9-bb27-44af-8d4d-de178cfdb234";
const state = () => (globalThis.mailingTest = { admin: true, clients: 0, invalidations: [], client: null });

test("every action checks admin authorization before accessing storage", async () => {
  const s = state(); s.admin = false;
  await assert.rejects(saveContact(contact), /Unauthorized/);
  await assert.rejects(importContacts([contact]), /Unauthorized/);
  await assert.rejects(deleteContact(id), /Unauthorized/);
  assert.equal(s.clients, 0);
});

test("invalid input and malformed IDs cannot reach storage", async () => {
  const s = state();
  assert.equal((await saveContact({ ...contact, email: "invalid" })).ok, false);
  assert.equal((await saveContact(contact, "bad-id")).ok, false);
  assert.equal((await importContacts([])).ok, false);
  assert.equal((await deleteContact("bad-id")).ok, false);
  assert.equal(s.clients, 0);
});

test("bulk import sends validated records in one call and reports existing duplicates", async () => {
  const s = state();
  let calls = 0;
  s.client = { rpc: async (name, args) => {
    calls++; assert.equal(name, "import_mailing_list_contacts");
    assert.deepEqual(args.contacts, [{ ...contact, email: "alex@example.com" }, { ...contact, email: "alex@example.com" }]);
    return { data: 1, error: null };
  } };
  const result = await importContacts([contact, contact]);
  assert.equal(result.ok, true);
  assert.match(result.message, /1 contact added.*1 already/);
  assert.equal(calls, 1);
  assert.deepEqual(s.invalidations, ["/mailing-list"]);
});

test("save errors preserve input and distinguish duplicate and removed records", async () => {
  const s = state();
  let response = { data: null, error: { code: "23505" } };
  const query = { select: () => query, eq: () => query, single: async () => response, maybeSingle: async () => response };
  s.client = { from: () => ({ insert: (value) => { assert.equal(value.email, "alex@example.com"); return query; }, update: () => query }) };
  assert.match((await saveContact(contact)).message, /already on the list/);
  response = { data: null, error: null };
  assert.match((await saveContact(contact, id)).message, /removed/);
  response = { data: { id }, error: null };
  assert.equal((await saveContact(contact, id)).ok, true);
  assert.deepEqual(s.invalidations, ["/mailing-list"]);
  assert.equal(contact.email, "ALEX@example.com");
});

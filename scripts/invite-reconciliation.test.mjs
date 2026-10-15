import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const replacements = {
  "server-only": "",
  "next/navigation": "export function redirect() { throw new Error('Unexpected redirect'); }",
  react: "export const cache = fn => fn;",
  "@/lib/reimbursements/supabase/admin": "export const createAdminClient = () => globalThis.inviteTest.admin;",
  "@/lib/reimbursements/supabase/server": "export const createClient = async () => globalThis.inviteTest.client;",
};
const bundle = await build({
  entryPoints: ["lib/reimbursements/auth.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "invite-clients", setup(builder) {
    builder.onResolve({ filter: /^(server-only|next\/navigation|react|@\/lib\/reimbursements\/supabase\/(admin|server))$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: replacements[args.path] }));
  } }],
});
const { getSessionProfile } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function setupFallback({ sameIdentity = false, failure = false } = {}) {
  const person = {
    id: sameIdentity ? "signed-in-id" : "pending-id", email: "person@example.com", full_name: "Managed Name", role: "none",
    contact_email: "contact@example.com", phone: "2025550100", membership: "brother", executive_roles: ["president"], has_signed_in: false,
  };
  const state = { person, inviteDeleted: false, updates: 0 };
  const clientQuery = { select: () => clientQuery, eq: () => clientQuery, maybeSingle: async () => ({ data: person.id === "signed-in-id" ? person : null }) };
  const profileQuery = { select: () => profileQuery, eq: () => profileQuery, maybeSingle: async () => ({ data: person }) };
  const inviteQuery = { select: () => inviteQuery, eq: () => inviteQuery, maybeSingle: async () => ({ data: { role: "member" } }) };
  const save = async values => {
    state.updates++;
    if (failure) return { error: { code: "23503", message: "Referenced identity" } };
    Object.assign(person, values);
    return { error: null };
  };
  state.client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "signed-in-id", email: person.email, user_metadata: { full_name: "Provider Name" } } } }) },
    from: () => clientQuery,
    rpc: async (name) => name === "get_my_app_access" ? { data: [{ app_key: "submit", access_level: "write" }], error: null } : { error: { code: "PGRST202", message: "RPC unavailable" } },
  };
  state.admin = { from(table) {
    if (table === "invites") return { ...inviteQuery, delete: () => ({ eq: async () => { state.inviteDeleted = true; return {}; } }) };
    assert.equal(table, "profiles");
    return { ...profileQuery, update: values => ({ eq: async (key, id) => { assert.equal(id, person.id); return save(values); } }), upsert: save };
  } };
  globalThis.inviteTest = state;
  return state;
}

for (const sameIdentity of [false, true]) {
  test(`fallback preserves managed details with ${sameIdentity ? "the same" : "a replaced"} identity`, async t => {
    t.mock.method(console, "error", () => {});
    const state = setupFallback({ sameIdentity });
    const session = await getSessionProfile();
    assert.equal(session.profile.full_name, "Managed Name");
    assert.equal(state.person.id, "signed-in-id");
    assert.equal(state.person.has_signed_in, true);
    assert.equal(state.person.contact_email, "contact@example.com");
    assert.equal(state.person.phone, "2025550100");
    assert.equal(state.person.membership, "brother");
    assert.deepEqual(state.person.executive_roles, ["president"]);
    assert.equal(state.updates, 1);
    assert.equal(state.inviteDeleted, true);
  });
}

test("failed identity transfer preserves the pending person and invitation", async t => {
  t.mock.method(console, "error", () => {});
  const state = setupFallback({ failure: true });
  await getSessionProfile();
  assert.equal(state.person.id, "pending-id");
  assert.equal(state.person.has_signed_in, false);
  assert.equal(state.inviteDeleted, false);
  assert.deepEqual(state.person.executive_roles, ["president"]);
});

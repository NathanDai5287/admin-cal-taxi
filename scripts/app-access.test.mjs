import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const mocks = {
  "server-only": "",
  "next/headers": "export const cookies = async () => ({ get: () => undefined });",
  "next/navigation": "export function redirect(path) { throw new Error(`Redirect: ${path}`); }",
  react: "export const cache = fn => fn;",
  "@/lib/reimbursements/supabase/server": "export const createClient = async () => globalThis.accessTest.client;",
  "@/lib/reimbursements/supabase/admin": "export const createAdminClient = () => { throw new Error('Unexpected privileged client'); };",
};
const bundle = await build({
  entryPoints: ["lib/reimbursements/auth.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "access-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path] }));
  } }],
});
const { getSessionProfile, requireAppAccess, hasAppAccess, requireAdmin } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function setup({ role = "member", removed = false, access = [], error = null, signedIn = true } = {}) {
  const profile = { id: "person", full_name: "Test Person", role, removed_at: removed ? "2026-10-14" : null };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: profile }) };
  globalThis.accessTest = { client: {
    auth: { getClaims: async () => ({ data: { claims: signedIn ? { sub: "person" } : {} } }) },
    from: () => query,
    rpc: async name => name === "get_my_app_access" ? { data: access, error } : { data: false, error: null },
  } };
}

test("read access permits reads and rejects writes and other apps", async () => {
  setup({ access: [{ app_key: "finance", access_level: "read" }] });
  assert.equal((await requireAppAccess("finance")).userId, "person");
  await assert.rejects(requireAppAccess("finance", "write"), /do not have write access/);
  await assert.rejects(requireAppAccess("host"), /do not have read access/);
});

test("write includes read and applies to chapter-role users without a legacy account role", async () => {
  setup({ role: "none", access: [{ app_key: "host", access_level: "write" }] });
  const session = await requireAppAccess("host", "write");
  assert.equal(hasAppAccess(session, "host"), true);
  assert.equal(hasAppAccess(session, "users"), false);
});

test("removed users cannot retain grants", async () => {
  setup({ role: "admin", removed: true, access: [{ app_key: "users", access_level: "write" }] });
  await assert.rejects(requireAppAccess("users"), /do not have read access/);
});

test("permission lookup errors fail closed", async () => {
  setup({ role: "admin", error: { message: "Unavailable" } });
  await assert.rejects(getSessionProfile(), /Unable to load app access/);
});

test("signed-out users cannot read or write", async () => {
  setup({ signedIn: false });
  await assert.rejects(requireAppAccess("users"), /Redirect: \//);
  assert.equal(hasAppAccess(null, "users"), false);
});


test("Finance write does not allow administrator reimbursement actions", async () => {
  setup({ role: "member", access: [{ app_key: "finance", access_level: "write" }] });
  assert.equal((await requireAppAccess("finance", "write")).userId, "person");
  await assert.rejects(requireAdmin(), /restricted to administrators/);
  setup({ role: "admin" });
  assert.equal((await requireAdmin()).userId, "person");
});

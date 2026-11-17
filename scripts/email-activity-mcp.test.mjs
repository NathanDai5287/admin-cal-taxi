import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const fixtures = `
export const state = { admin: true, finance: true, auditError: false, charge: true, calls: [] };
export async function loadEmailActivity(id) { state.calls.push(["legacy", id]); return [{ kind: "hosting", related_id: id }]; }
export async function loadDuesEmailHistory(id) {
  state.calls.push(["dues", id]);
  return [{ id: "payment", html: "<!doctype html>\\n<p>Exact &amp; saved</p>", sentAt: "2026-11-17T05:57:50Z", providerId: "resend-id" }];
}
export function createAdminClient() {
  state.calls.push(["admin-client"]);
  return { from(table) {
    if (table === "mcp_audit_log") return { async insert(row) { state.calls.push(["audit", row]); return { error: state.auditError }; } };
    const query = { select() { return query; }, eq() { return query; }, async maybeSingle() { state.calls.push(["charge"]); return { data: state.charge ? { id: "charge" } : null, error: null }; } };
    return query;
  } };
}
`;
const bundled = await build({
  stdin: { contents: 'export { loadMcpEmailActivity } from "./lib/mcp/email-activity"; export { state } from "email-fixture";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "email-fixture", setup(builder) {
    builder.onResolve({ filter: /^(server-only|email-fixture)$|^\.\.\/email-tracking$|^\.\.\/reimbursements\/(dues-email-history|supabase\/admin)$/ }, ({ path }) => ({ path: path === "server-only" ? "empty" : "fixtures", namespace: "email-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "email-fixture" }, ({ path }) => ({ contents: path === "empty" ? "" : fixtures }));
  } }],
});
const { loadMcpEmailActivity, state } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const chargeId = "590da5c4-8a7e-4c62-b556-0592b5119c52";
const caller = { userId: "admin", clientId: "client" };
const supabase = { async rpc(name) { state.calls.push([name]); return { data: name === "is_mcp_admin" ? state.admin : state.finance, error: null }; } };

test.beforeEach(() => Object.assign(state, { admin: true, finance: true, auditError: false, charge: true, calls: [] }));

test("dues email reads preserve exact HTML and provider acceptance after permission and audit", async () => {
  const [message] = await loadMcpEmailActivity(supabase, caller, chargeId);
  assert.equal(message.html, "<!doctype html>\n<p>Exact &amp; saved</p>");
  assert.equal(message.sentAt, "2026-11-17T05:57:50Z");
  assert.equal(message.providerId, "resend-id");
  assert.equal(message.kind, "dues");
  assert.deepEqual(state.calls.map(([name]) => name), ["is_mcp_admin", "has_mcp_app_access", "admin-client", "audit", "charge", "dues"]);
  assert.deepEqual(state.calls[3][1], { user_id: "admin", client_id: "client", tool_name: "list_email_activity", target_id: chargeId });
});

test("nonadministrators cannot read any email data", async () => {
  state.admin = false;
  await assert.rejects(loadMcpEmailActivity(supabase, caller, chargeId), /Administrator access/);
  assert.deepEqual(state.calls, [["is_mcp_admin"]]);
});

test("Finance denial never queries private charges or dues emails", async () => {
  state.finance = false;
  assert.deepEqual(await loadMcpEmailActivity(supabase, caller, chargeId), [{ kind: "hosting", related_id: chargeId }]);
  assert.deepEqual(state.calls.map(([name]) => name), ["is_mcp_admin", "has_mcp_app_access", "legacy"]);
});

test("audit failure prevents target and body reads", async () => {
  state.auditError = true;
  await assert.rejects(loadMcpEmailActivity(supabase, caller, chargeId), /could not be recorded/);
  assert.ok(!state.calls.some(([name]) => name === "charge" || name === "dues"));
});

test("other UUID targets retain their existing email history", async () => {
  state.charge = false;
  assert.deepEqual(await loadMcpEmailActivity(supabase, caller, chargeId), [{ kind: "hosting", related_id: chargeId }]);
  assert.ok(!state.calls.some(([name]) => name === "dues"));
});

test("unfiltered and non-UUID history keeps its existing read path", async () => {
  for (const id of [undefined, "host-order"]) {
    state.calls = [];
    assert.deepEqual(await loadMcpEmailActivity(supabase, caller, id), [{ kind: "hosting", related_id: id }]);
    assert.deepEqual(state.calls.map(([name]) => name), ["is_mcp_admin", "legacy"]);
  }
});

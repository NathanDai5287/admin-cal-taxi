import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { build } from "esbuild";

const modules = {
  name: "member-finance-test-modules",
  setup(builder) {
    builder.onResolve({ filter: /^(server-only)$|\/supabase\/admin$/ }, (args) => ({ path: args.path, namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
      contents: args.path === "server-only" ? "" : "export const createAdminClient = () => globalThis.memberFinanceTestAdmin;",
    }));
  },
};
const bundle = await build({
  entryPoints: ["lib/mcp/member-finance.ts"], bundle: true, write: false, format: "esm", platform: "node", packages: "external", plugins: [modules],
});
const temporary = path.join(process.cwd(), `node_modules/.member-finance-test-${randomUUID()}.mjs`);
await writeFile(temporary, bundle.outputFiles[0].text);
const { registerMemberFinanceTools, updateMemberCharge } = await import(`file://${temporary}`);
await unlink(temporary);

const memberId = "522e7fce-1801-4626-9345-6dcb7d189784";
const otherMemberId = "0de9df5a-5390-4eab-9236-ad3372e0b848";
const chargeId = "aa4d3173-963c-4bc3-8c35-d895de8e1f8e";
const waivedId = "bcdb67c0-0726-41f1-a87b-0cc8ef067944";
const legacyId = "06212627-0cbe-4fd5-9c69-afe61726b989";

function fixture() {
  const charge = {
    id: chargeId, member_id: memberId, member_name: "Casey Member", notes: "Chapter dues",
    amount_assessed: 725, amount_paid: 242, due_date: "2026-11-15", waived_at: null, waived_by: null,
    payment_plan_frequency: "monthly", payment_plan_amount: 242, payment_plan_start_date: "2026-10-15", payment_plan_interval_days: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T00:00:00Z",
  };
  const payment = { receivable_id: chargeId, paid_date: "2026-10-16", date_is_estimated: true, recorded_by: null, recorder_name: null };
  const reimbursement = {
    id: randomUUID(), user_id: memberId, full_name: "Casey Member", category: "house", description: "Supplies", amount: 12.34,
    requested_amount: 15, status: "approved", reimbursed: false, reimbursed_at: null, reimbursement_date_is_estimated: false,
    payment_method: "casey@example.com", merchant: "Shop", approval_note: "Approved receipt total", denial_reason: null,
    receipt_path: "private/receipt.jpg", receipt_date: "2026-10-02", receipt_total: 12.34, failure_reason: null,
    submitted_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-04T00:00:00Z",
  };
  return {
    profiles: [{ id: memberId, full_name: "Casey Member", email: "casey@example.com", removed_at: "2026-11-01T00:00:00Z" }],
    chapter_receivables: [
      charge,
      { ...charge, id: waivedId, amount_assessed: 50, amount_paid: 20, waived_at: "2026-10-20T00:00:00Z", waived_by: otherMemberId },
      { ...charge, id: legacyId, member_id: null },
      { ...charge, id: randomUUID(), member_id: otherMemberId, amount_assessed: 999 },
    ],
    chapter_dues_payment_events: [
      { ...payment, id: "payment", amount: 300, created_at: "2026-10-16T00:00:00Z" },
      { ...payment, id: "correction", amount: -58, date_is_estimated: false, recorded_by: otherMemberId, recorder_name: "Treasurer", created_at: "2026-10-17T00:00:00Z" },
      { ...payment, id: "waived-payment", receivable_id: waivedId, amount: 20, created_at: "2026-10-16T00:00:00Z" },
      { ...payment, id: "legacy-payment", receivable_id: legacyId, amount: 242, created_at: "2026-10-16T00:00:00Z" },
    ],
    chapter_receivable_notes: [
      { id: "note", receivable_id: chargeId, body: "Agreed monthly plan", created_by: otherMemberId, author_name: "Treasurer", created_at: "2026-10-01T00:00:00Z" },
      { id: "unlinked-note", receivable_id: legacyId, body: "Legacy only", created_by: otherMemberId, author_name: "Treasurer", created_at: "2026-10-01T00:00:00Z" },
    ],
    reimbursements: [
      reimbursement,
      { ...reimbursement, id: randomUUID(), amount: 4.56, status: "pending" },
      { ...reimbursement, id: randomUUID(), amount: 2.1, status: "denied" },
      { ...reimbursement, id: randomUUID(), amount: 8.76, reimbursed: true, reimbursed_at: "2026-10-10T00:00:00Z", reimbursement_date_is_estimated: true },
      { ...reimbursement, id: randomUUID(), user_id: null, amount: 999 },
      { ...reimbursement, id: randomUUID(), user_id: otherMemberId, amount: 999 },
    ],
    mcp_audit_log: [],
  };
}

function connect({ tables = fixture(), allowed = true, writeAllowed = allowed, auditError = false, readError = null, beforeUpdate = () => {}, updateError = false } = {}) {
  const queries = [];
  const permissions = [];
  class Query {
    filters = [];
    sorts = [];
    start = 0;
    end = Infinity;
    constructor(table) { this.table = table; }
    select() { return this; }
    update(values) { this.values = values; return this; }
    eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
    is(column, value) { return this.eq(column, value); }
    in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
    order(column) { this.sorts.push(column); return this; }
    range(start, end) { this.start = start; this.end = end; return this; }
    maybeSingle() { this.single = true; return this; }
    async insert(row) {
      if (auditError) return { error: { message: "Audit unavailable" } };
      tables[this.table].push(row);
      return { error: null };
    }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }
    run() {
      queries.push({ table: this.table, start: this.start, auditCount: tables.mcp_audit_log.length });
      if (readError === this.table) return { data: null, error: { message: "Read unavailable" } };
      if (this.values) beforeUpdate(tables);
      if (this.values && updateError) return { data: null, error: { message: "Update unavailable" } };
      const rows = tables[this.table].filter((row) => this.filters.every((matches) => matches(row)));
      if (this.values) rows.forEach((row) => Object.assign(row, this.values));
      rows.sort((a, b) => this.sorts.reduce((order, column) => order || String(a[column]).localeCompare(String(b[column])), 0));
      const page = rows.slice(this.start, this.end + 1);
      return { data: structuredClone(this.single ? page[0] ?? null : page), error: null };
    }
  }
  globalThis.memberFinanceTestAdmin = { from: (table) => new Query(table) };
  const session = { rpc: async (name, args) => {
    permissions.push({ name, args });
    if (name === "mcp_admin_read") return { data: { charges: ["existing charge list"] }, error: null };
    if (name === "mcp_admin_write") return { data: { id: args.p_payload.chargeId }, error: null };
    return { data: args.required_access === "write" ? writeAllowed : allowed, error: null };
  } };
  const caller = { userId: otherMemberId, clientId: "finance-reader" };
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "finance-test", version: "1.0.0" });
    registerMemberFinanceTools(server, session, caller);
    return server;
  });
  async function request(method, params) {
    const response = await handler.fetch(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    return JSON.parse((await response.text()).match(/^data: (.*)$/m)[1]).result;
  }
  const call = (name, args) => request("tools/call", { name, arguments: args });
  const updateCharge = (input) => updateMemberCharge(session, caller, input);
  return { request, call, tables, queries, permissions, caller, updateCharge };
}

test("detail tools advertise read-only contracts and require stable IDs", async () => {
  const { request, call, queries } = connect();
  const { tools } = await request("tools/list", {});
  assert.deepEqual(tools.map((tool) => tool.name), ["list_member_charges", "get_member_finances", "get_member_charge"]);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.idempotentHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }
  assert.equal((await call("get_member_finances", { memberId: "Casey" })).isError, true);
  assert.equal(queries.length, 0);
});

test("finance permission and successful audit precede every sensitive read", async () => {
  for (const tool of ["list_member_charges", "get_member_finances", "get_member_charge"]) {
    const args = tool === "get_member_charge" ? { chargeId } : { memberId };
    const denied = connect({ allowed: false });
    const result = await denied.call(tool, args);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Finance read access/);
    assert.deepEqual(denied.permissions, [{ name: "has_mcp_app_access", args: { app_key: "finance", required_access: "read" } }]);
    assert.equal(denied.queries.length, 0);
    assert.equal(denied.tables.mcp_audit_log.length, 0);
    const audit = connect({ auditError: true });
    assert.equal((await audit.call(tool, args)).isError, true);
    assert.equal(audit.queries.length, 0);
  }
});

test("the existing charge tool preserves its list and supports complete member statements", async () => {
  const { call, permissions, queries } = connect();
  const list = await call("list_member_charges", {});
  assert.deepEqual(list.structuredContent, { charges: ["existing charge list"] });
  assert.deepEqual(permissions, [{ name: "mcp_admin_read", args: { p_resource: "member_charges" } }]);
  assert.equal(queries.length, 0);
  const statement = await call("list_member_charges", { memberId });
  assert.ok(!statement.isError, statement.content?.[0]?.text);
  assert.equal(statement.structuredContent.charges.length, 2);
  assert.equal(statement.structuredContent.charges[0].schedule.length, 3);
  assert.equal(statement.structuredContent.reimbursements.length, 4);
});

test("member finance returns isolated historical data, exact schedules, and separate totals", async () => {
  const { call, tables, queries, caller } = connect();
  const response = await call("get_member_finances", { memberId });
  assert.ok(!response.isError, response.content?.[0]?.text);
  const finance = response.structuredContent;
  assert.equal(finance.currency, "USD");
  assert.equal(finance.member.removedAt, "2026-11-01T00:00:00Z");
  assert.equal(finance.charges.length, 2);
  assert.equal(finance.reimbursements.length, 4);
  assert.deepEqual(finance.totals, {
    charges: { amountAssessed: 775, amountPaid: 262, outstanding: 483, waivedAmount: 30 },
    reimbursements: { requested: 60, approved: 21.1, paid: 8.76, payable: 12.34, pending: 4.56, denied: 2.1 },
  });
  const charge = finance.charges.find((row) => row.id === chargeId);
  assert.deepEqual(charge.paymentPlan, { frequency: "monthly", amount: 242, intervalDays: null, startDate: "2026-10-15", frequencyLabel: "monthly" });
  assert.equal(charge.currentDueDate, "2026-11-15");
  assert.deepEqual(charge.schedule.map(({ dueDate, amount, amountPaid, remaining, status }) => ({ dueDate, amount, amountPaid, remaining, status })), [
    { dueDate: "2026-10-15", amount: 242, amountPaid: 242, remaining: 0, status: "paid" },
    { dueDate: "2026-11-15", amount: 242, amountPaid: 0, remaining: 242, status: "unpaid" },
    { dueDate: "2026-12-15", amount: 241, amountPaid: 0, remaining: 241, status: "unpaid" },
  ]);
  assert.equal(charge.nextPayment.dueDate, "2026-11-15");
  assert.equal(charge.payments[0].dateIsEstimated, true);
  assert.deepEqual(charge.payments[1], { id: "correction", amount: -58, type: "reversal", paidDate: "2026-10-16", dateIsEstimated: false, recordedAt: "2026-10-17T00:00:00Z", recordedBy: otherMemberId, recorderName: "Treasurer" });
  assert.equal(charge.notes[0].body, "Agreed monthly plan");
  const waived = finance.charges.find((row) => row.id === waivedId);
  assert.equal(waived.status, "waived");
  assert.equal(waived.outstanding, 0);
  assert.equal(waived.unpaidAmount, 30);
  assert.equal(waived.nextPayment, null);
  assert.ok(waived.schedule.every((installment) => !installment.overdue));
  assert.equal(finance.reimbursements[0].receiptPath, "private/receipt.jpg");
  assert.equal(finance.reimbursements[0].approvalNote, "Approved receipt total");
  assert.deepEqual(tables.mcp_audit_log, [{ user_id: caller.userId, client_id: caller.clientId, tool_name: "get_member_finances", target_id: memberId }]);
  assert.ok(queries.every((query) => query.auditCount === 1));
});

test("legacy charge detail supports a single payment without assigning a member", async () => {
  const tables = fixture();
  Object.assign(tables.chapter_receivables.find((row) => row.id === legacyId), {
    payment_plan_frequency: null, payment_plan_amount: null, payment_plan_interval_days: null, payment_plan_start_date: null,
  });
  const { call } = connect({ tables });
  const response = await call("get_member_charge", { chargeId: legacyId });
  assert.ok(!response.isError, response.content?.[0]?.text);
  const { charge } = response.structuredContent;
  assert.equal(charge.memberId, null);
  assert.equal(charge.paymentPlan, null);
  assert.equal(charge.payments.length, 1);
  assert.equal(charge.notes[0].body, "Legacy only");
  assert.equal(charge.schedule.length, 1);
  assert.equal(charge.schedule[0].status, "partially_paid");
  assert.equal(charge.schedule[0].remaining, 483);
});

test("complete schedules handle month-end, custom intervals, and paid charges", async () => {
  for (const [frequency, intervalDays, expected] of [
    ["monthly", null, ["2026-01-31", "2026-02-28", "2026-03-31"]],
    ["weekly", null, ["2026-01-31", "2026-02-07", "2026-02-14"]],
    ["biweekly", null, ["2026-01-31", "2026-02-14", "2026-02-28"]],
    ["custom", 10, ["2026-01-31", "2026-02-10", "2026-02-20"]],
  ]) {
    const tables = fixture();
    Object.assign(tables.chapter_receivables[0], { payment_plan_start_date: "2026-01-31", payment_plan_frequency: frequency, payment_plan_interval_days: intervalDays, amount_paid: 725 });
    const response = await connect({ tables }).call("get_member_charge", { chargeId });
    assert.ok(!response.isError, response.content?.[0]?.text);
    const { charge } = response.structuredContent;
    assert.deepEqual(charge.schedule.map((installment) => installment.dueDate), expected);
    assert.ok(charge.schedule.every((installment) => installment.status === "paid"));
    assert.equal(charge.nextPayment, null);
  }
});

test("member finance reads past page limits for charges, events, notes, and reimbursements", async () => {
  const tables = fixture();
  const charge = tables.chapter_receivables[0];
  const reimbursement = tables.reimbursements[0];
  const payment = tables.chapter_dues_payment_events[0];
  const note = tables.chapter_receivable_notes[0];
  tables.chapter_receivables = Array.from({ length: 1001 }, (_, index) => ({ ...charge, id: String(index), amount_assessed: 0.11, amount_paid: 0.1, payment_plan_frequency: null }));
  tables.chapter_dues_payment_events = tables.chapter_receivables.map((row) => ({ ...payment, id: row.id, receivable_id: row.id, amount: 0.1 }));
  tables.chapter_receivable_notes = tables.chapter_receivables.map((row) => ({ ...note, id: row.id, receivable_id: row.id }));
  tables.reimbursements = Array.from({ length: 1001 }, (_, index) => ({ ...reimbursement, id: String(index), amount: 0.1, requested_amount: null }));
  const { call, queries } = connect({ tables });
  const response = await call("get_member_finances", { memberId });
  assert.ok(!response.isError, response.content?.[0]?.text);
  assert.equal(response.structuredContent.charges.length, 1001);
  assert.equal(response.structuredContent.reimbursements.length, 1001);
  assert.equal(response.structuredContent.totals.charges.outstanding, 10.01);
  assert.equal(response.structuredContent.totals.reimbursements.payable, 100.1);
  assert.ok(response.structuredContent.charges.every((row) => row.payments.length === 1 && row.notes.length === 1));
  for (const table of ["chapter_receivables", "chapter_dues_payment_events", "chapter_receivable_notes", "reimbursements"]) {
    assert.ok(queries.some((query) => query.table === table && query.start === 1000));
  }
});

test("missing members and charges fail clearly, while empty finances stay valid", async () => {
  const missing = connect();
  assert.match((await missing.call("get_member_finances", { memberId: randomUUID() })).content[0].text, /Member not found/);
  assert.match((await missing.call("get_member_charge", { chargeId: randomUUID() })).content[0].text, /Charge not found/);
  const tables = fixture();
  tables.chapter_receivables = [];
  tables.reimbursements = [];
  const response = await connect({ tables }).call("get_member_finances", { memberId });
  assert.ok(!response.isError, response.content?.[0]?.text);
  assert.deepEqual(response.structuredContent.charges, []);
  assert.deepEqual(response.structuredContent.reimbursements, []);
  assert.equal(response.structuredContent.totals.charges.outstanding, 0);
});

test("failed history reads return errors instead of an incomplete financial statement", async () => {
  for (const readError of ["profiles", "chapter_receivables", "chapter_dues_payment_events", "chapter_receivable_notes", "reimbursements"]) {
    const response = await connect({ readError }).call("get_member_finances", { memberId });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /could not be loaded/);
  }
});

const amountUpdate = { chargeId, memberId, amountOwed: 484, dueDate: "2026-11-15", notes: "Chapter dues" };

test("amount-only updates retain removed ownership, payment history, dates, notes, and plan", async () => {
  const { updateCharge, tables, queries, permissions, caller } = connect();
  const before = structuredClone(tables);
  assert.deepEqual(await updateCharge(amountUpdate), { id: chargeId });
  const after = tables.chapter_receivables[0];
  assert.equal(after.amount_assessed, 726);
  assert.deepEqual(after, { ...before.chapter_receivables[0], amount_assessed: 726 });
  assert.deepEqual(tables.chapter_dues_payment_events, before.chapter_dues_payment_events);
  assert.deepEqual(tables.chapter_receivable_notes, before.chapter_receivable_notes);
  assert.deepEqual(tables.profiles, before.profiles);
  assert.deepEqual(permissions, [{ name: "has_mcp_app_access", args: { app_key: "finance", required_access: "write" } }]);
  assert.deepEqual(tables.mcp_audit_log, [{ user_id: caller.userId, client_id: caller.clientId, tool_name: "update_member_charge", target_id: chargeId }]);
  assert.ok(queries.every((query) => query.auditCount === 1));
});

test("amount updates require write access and a successful audit before any charge access", async () => {
  for (const options of [{ allowed: false }, { allowed: true, writeAllowed: false }, { auditError: true }]) {
    const { updateCharge, tables, queries } = connect(options);
    await assert.rejects(() => updateCharge(amountUpdate), /Finance write access|could not be recorded/);
    assert.equal(queries.length, 0);
    assert.equal(tables.chapter_receivables[0].amount_assessed, 725);
  }
});

test("amount updates refuse concurrent payments, ownership changes, and waivers", async () => {
  for (const change of [
    { amount_paid: 300, updated_at: "new-version" },
    { member_id: otherMemberId },
    { waived_at: "2026-11-01T00:00:00Z" },
  ]) {
    const { updateCharge, tables } = connect({ beforeUpdate: (tables) => Object.assign(tables.chapter_receivables[0], change) });
    await assert.rejects(() => updateCharge(amountUpdate), /charge changed/);
    assert.equal(tables.chapter_receivables[0].amount_assessed, 725);
  }
});

test("amount-only updates reject waived or fully paid charges and report load/update failures", async () => {
  for (const changes of [{ waived_at: "2026-11-01T00:00:00Z" }, { amount_paid: 725 }]) {
    const tables = fixture();
    Object.assign(tables.chapter_receivables[0], changes);
    await assert.rejects(() => connect({ tables }).updateCharge(amountUpdate), /waived charge|fully paid charge/);
    assert.equal(tables.chapter_receivables[0].amount_assessed, 725);
  }
  await assert.rejects(() => connect({ readError: "chapter_receivables" }).updateCharge(amountUpdate), /could not be loaded/);
  await assert.rejects(() => connect({ updateError: true }).updateCharge(amountUpdate), /could not be updated/);
  await assert.rejects(() => connect().updateCharge({ ...amountUpdate, chargeId: randomUUID() }), /Charge not found/);
});

test("reassignments and other field edits retain the existing SQL validation path", async () => {
  for (const change of [{ memberId: otherMemberId }, { notes: "Changed" }, { dueDate: "2026-12-15" }]) {
    const { updateCharge, permissions, tables } = connect();
    const input = { ...amountUpdate, ...change };
    assert.deepEqual(await updateCharge(input), { id: chargeId });
    const { amountOwed, ...payload } = input;
    assert.deepEqual(permissions.at(-1), { name: "mcp_admin_write", args: { p_action: "update_charge", p_payload: { ...payload, amount: amountOwed } } });
    assert.equal(tables.chapter_receivables[0].amount_assessed, 725);
  }
});

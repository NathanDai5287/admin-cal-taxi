import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { buildBudgetCategories, buildFinanceOverview } from "../lib/mcp/finance.ts";

test("finance tools calculate the same read-only totals shown to administrators", () => {
  assert.deepEqual(buildFinanceOverview({
    openingCash: 1000,
    income: [500, "250.25"],
    reimbursements: [
      { amount: 100, status: "approved", reimbursed: true },
      { amount: 75.5, status: "approved", reimbursed: false },
      { amount: 999, status: "pending", reimbursed: false },
    ],
    manualExpenses: [50],
    receivables: [
      { amountAssessed: 300, amountPaid: 125 },
      { amountAssessed: 50, amountPaid: 50 },
    ],
  }), {
    currency: "USD",
    openingCash: 1000,
    recordedIncome: 750.25,
    approvedSpending: 225.5,
    cashPosition: 1600.25,
    accountsReceivable: 175,
    reimbursementsToPay: 75.5,
  });

  assert.deepEqual(buildBudgetCategories(
    [{ budgetKey: "administration", amount: 500 }],
    [
      { category: "administration", amount: 125, status: "approved" },
      { category: "administration", amount: 200, status: "pending" },
    ],
    [{ category: "miscellaneous_fees", amount: 115 }],
  ), [
    { category: "administration", budget: 500, spent: 125, remaining: 375 },
    { category: "miscellaneous_fees", budget: null, spent: 115, remaining: null },
  ]);
});

test("only active administrators can write their own secret-free MCP audit records", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.jwt() returns jsonb language sql as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    create table public.profiles (
      id uuid primary key,
      role text not null,
      removed_at timestamptz
    );
    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and removed_at is null
      )
    $$;
    create table public.chapter_financial_settings (id boolean primary key, opening_cash numeric);
    create table public.reimbursement_budget_entries (amount numeric, kind text);
    create table public.reimbursements (amount numeric, status text, reimbursed boolean, category text);
    create table public.reimbursement_manual_expenses (amount numeric, category text);
    create table public.chapter_receivables (
      member_name text,
      amount_assessed numeric,
      amount_paid numeric,
      due_date date
    );
    create table public.reimbursement_budgets (budget_key text primary key, amount numeric);
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/20260918000000_mcp_audit_log.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  const adminId = randomUUID();
  const memberId = randomUUID();
  await db.query(
    "insert into public.profiles (id, role) values ($1, 'admin'), ($2, 'member')",
    [adminId, memberId],
  );

  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: adminId })]);
  assert.equal((await db.query("select public.is_admin() as allowed")).rows[0].allowed, true);
  await assert.rejects(db.query("select public.mcp_finance_overview()"), /OAuth grant is required/);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: adminId, client_id: "client-id" })]);
  assert.equal((await db.query("select public.is_admin() as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select public.is_mcp_admin() as allowed")).rows[0].allowed, true);
  await assert.rejects(
    db.query(
      "insert into public.mcp_audit_log (user_id, client_id, tool_name) values ($1, 'client-id', 'list_open_dues')",
      [adminId],
    ),
    /permission denied/,
  );
  await db.query("select public.mcp_finance_overview()");
  assert.equal((await db.query("select count(*)::int as count from public.mcp_audit_log")).rows[0].count, 1);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: memberId, client_id: "client-id" })]);
  await assert.rejects(db.query("select public.mcp_finance_overview()"), /OAuth grant is required/);
  await db.exec("reset role");
  await assert.rejects(
    db.query(
      "insert into public.mcp_audit_log (user_id, client_id, tool_name) values ($1, 'token-value', 'unknown_tool')",
      [adminId],
    ),
    /check constraint/,
  );
  const columns = await db.query(
    "select column_name from information_schema.columns where table_name = 'mcp_audit_log' order by column_name",
  );
  assert.equal(columns.rows.some((row) => /token|secret/i.test(row.column_name)), false);
});

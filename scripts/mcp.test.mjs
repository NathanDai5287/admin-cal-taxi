import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { buildBudgetCategories, buildFinanceOverview, isCalendarDate } from "../lib/mcp/finance.ts";
import { categories, categoryBudgetMap, categoryRegistry, categoryValues } from "../lib/reimbursements/format.ts";

test("one category registry derives keys, labels, and budget values", () => {
  assert.deepEqual(categoryValues, categoryRegistry.map(({ value }) => value));
  assert.deepEqual(categories, categoryRegistry.map(({ value, label }) => [value, label]));
  assert.deepEqual(
    [...categoryBudgetMap({ administration: 500, miscellaneous_fees: null, unknown: 20 })],
    [["administration", 500], ["miscellaneous_fees", null]],
  );
});

test("MCP date validation rejects impossible calendar dates", () => {
  assert.equal(isCalendarDate("2026-02-28"), true);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-2-8"), false);
});

test("external MCP tools use provider idempotency and clean receipt storage", async () => {
  const [server, discord, invites] = await Promise.all([
    readFile(new URL("../lib/mcp/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/reimbursements/discord.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/reimbursements/send-invite-email.ts", import.meta.url), "utf8"),
  ]);
  assert.match(server, /sendInviteEmails\(\[payload\.email\], payload\.role, requestId\)/);
  assert.match(server, /content\.length > 2000/);
  assert.match(server, /storage\.from\("receipts"\)\.remove/);
  assert.match(discord, /enforce_nonce: true/);
  assert.match(invites, /idempotencyKey:/);
});

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
    { administration: 500 },
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
    create type public.app_role as enum ('none', 'member', 'admin');
    create type public.reimbursement_category as enum (
      'administration', 'rush', 'socials', 'education', 'philanthropy',
      'brother_bonding', 'retreat', 'house', 'miscellaneous_fees'
    );
    create type public.reimbursement_status as enum ('pending', 'approved', 'denied', 'needs_review');
    create type public.chapter_income_source as enum (
      'active_member_dues', 'new_member_fees', 'fundraising', 'alumni_donations', 'other'
    );
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
      removed_at timestamptz,
      full_name text not null default '',
      email text not null default '',
      has_signed_in boolean not null default true,
      discord_user_id text not null default ''
    );
    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and removed_at is null
      )
    $$;
    create table public.invites (email text primary key, role public.app_role, invited_by uuid, created_at timestamptz default now());
    create table public.chapter_financial_settings (
      id boolean primary key, opening_cash numeric, updated_by uuid, updated_at timestamptz default now()
    );
    create table public.reimbursement_budget_entries (
      id uuid primary key default gen_random_uuid(), amount numeric, kind text, description text,
      source public.chapter_income_source, budget_date date, created_by uuid,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.reimbursements (
      id uuid primary key default gen_random_uuid(), user_id uuid, full_name text default '', amount numeric,
      description text default '', payment_method text default '', receipt_path text default '',
      status public.reimbursement_status, reimbursed boolean, category public.reimbursement_category,
      merchant text, submitted_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.reimbursement_manual_expenses (
      id uuid primary key default gen_random_uuid(), amount numeric, category public.reimbursement_category,
      description text, expense_date date, receipt_path text, created_by uuid,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.chapter_receivables (
      id uuid primary key default gen_random_uuid(), member_id uuid references public.profiles(id), member_name text,
      amount_assessed numeric,
      amount_paid numeric,
      due_date date, notes text default '', discord_user_id text default '', created_by uuid,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.reimbursement_budgets (
      budget_key text primary key, amount numeric, updated_by uuid, updated_at timestamptz default now()
    );
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/20260918000000_mcp_audit_log.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  const budgetMigration = await readFile(
    new URL("../supabase/migrations/20260919100000_budget_category_map.sql", import.meta.url),
    "utf8",
  );
  await db.exec(budgetMigration);
  const writeMigration = await readFile(
    new URL("../supabase/migrations/20260920000000_mcp_admin_writes.sql", import.meta.url),
    "utf8",
  );
  await db.exec(writeMigration);
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
      "insert into public.mcp_audit_log (user_id, client_id, tool_name) values ($1, 'token-value', repeat('x', 101))",
      [adminId],
    ),
    /check constraint/,
  );
  const columns = await db.query(
    "select column_name from information_schema.columns where table_name = 'mcp_audit_log' order by column_name",
  );
  assert.equal(columns.rows.some((row) => /token|secret/i.test(row.column_name)), false);
});

test("MCP writes include invited members, require confirmation, and prevent duplicate credits", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create type public.app_role as enum ('none', 'member', 'admin');
    create type public.reimbursement_category as enum (
      'administration', 'rush', 'socials', 'education', 'philanthropy',
      'brother_bonding', 'retreat', 'house', 'miscellaneous_fees'
    );
    create type public.reimbursement_status as enum ('pending', 'approved', 'denied');
    create type public.chapter_income_source as enum ('other');
    create function auth.jwt() returns jsonb language sql as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.profiles (id uuid primary key, role text, removed_at timestamptz, full_name text, email text, has_signed_in boolean, discord_user_id text default '');
    create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select false $$;
    create function public.is_mcp_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select coalesce(auth.jwt() ->> 'client_id', '') <> '' and exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin' and removed_at is null
      )
    $$;
    create table public.mcp_audit_log (id bigint generated always as identity primary key, user_id uuid references public.profiles(id), client_id text, tool_name text, called_at timestamptz default now());
    create table public.invites (email text primary key, role public.app_role, invited_by uuid, created_at timestamptz default now());
    create table public.chapter_receivables (id uuid primary key default gen_random_uuid(), member_id uuid references public.profiles(id), member_name text, amount_assessed numeric, amount_paid numeric default 0, due_date date, notes text default '', discord_user_id text default '', created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.reimbursement_budgets (budget_key text primary key, amount numeric, updated_by uuid, updated_at timestamptz default now());
    create table public.reimbursement_budget_entries (id uuid primary key default gen_random_uuid(), kind text, amount numeric, description text, source public.chapter_income_source, budget_date date, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.chapter_financial_settings (id boolean primary key, opening_cash numeric, updated_by uuid, updated_at timestamptz default now());
    create table public.reimbursements (id uuid primary key default gen_random_uuid(), full_name text, amount numeric, description text, status public.reimbursement_status, reimbursed boolean, category public.reimbursement_category, merchant text, submitted_at timestamptz default now());
    create table public.reimbursement_manual_expenses (id uuid primary key default gen_random_uuid(), amount numeric, category public.reimbursement_category, description text, expense_date date, receipt_path text, created_by uuid, created_at timestamptz default now());
    grant select on public.chapter_receivables, public.mcp_audit_log, public.reimbursement_budgets to authenticated;
  `);
  await db.exec("insert into public.reimbursement_budgets (budget_key, amount) values ('administration', 500), ('miscellaneous_fees', null)");
  const budgetMigration = await readFile(new URL("../supabase/migrations/20260919100000_budget_category_map.sql", import.meta.url), "utf8");
  await db.exec(budgetMigration);
  const migratedBudgets = (await db.query("select category_amounts from public.reimbursement_budgets where id")).rows[0].category_amounts;
  assert.equal(migratedBudgets.administration, 500);
  assert.equal(migratedBudgets.miscellaneous_fees, null);
  assert.equal(Object.keys(migratedBudgets).length, 9);
  await assert.rejects(
    db.query("update public.reimbursement_budgets set category_amounts = $1::jsonb where id", [JSON.stringify([])]),
    /reimbursement_budget_values_check/,
  );
  await assert.rejects(
    db.query("update public.reimbursement_budgets set category_amounts = $1::jsonb where id", [JSON.stringify({ administration: -1 })]),
    /reimbursement_budget_values_check/,
  );
  await assert.rejects(
    db.query("update public.reimbursement_budgets set category_amounts = $1::jsonb where id", [JSON.stringify({ unknown: 1 })]),
    /reimbursement_budget_values_check/,
  );
  await assert.rejects(
    db.query("update public.reimbursement_budgets set category_amounts = $1::jsonb where id", [JSON.stringify({ administration: 1.234 })]),
    /reimbursement_budget_values_check/,
  );
  await db.query("update public.reimbursement_budgets set category_amounts = $1::jsonb where id", [JSON.stringify({ administration: 700, miscellaneous_fees: null })]);
  assert.equal((await db.query("select category_amounts from public.reimbursement_budgets where id")).rows[0].category_amounts.administration, 700);
  const migration = await readFile(new URL("../supabase/migrations/20260920000000_mcp_admin_writes.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const adminId = randomUUID();
  const invitedId = randomUUID();
  await db.query("insert into public.profiles values ($1, 'admin', null, 'Admin', 'admin@example.com', true, ''), ($2, 'member', null, 'Invited', 'invite@example.com', false, '')", [adminId, invitedId]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: adminId, client_id: "client-id" })]);
  const listedBudgets = (await db.query("select public.mcp_budget_categories() as result")).rows[0].result.categories;
  assert.equal(listedBudgets.length, 9);
  assert.equal(listedBudgets.some(({ category }) => category === "house"), true);

  const chargeRequest = randomUUID();
  const payload = { members: [{ memberId: invitedId, notes: "Invited member note" }], amount: 50, dueDate: "2026-10-01" };
  const first = await db.query("select public.mcp_admin_write('add_charges', $1::jsonb, $2, false) as result", [JSON.stringify(payload), chargeRequest]);
  await db.query("select public.mcp_admin_write('add_charges', $1::jsonb, $2, false)", [JSON.stringify(payload), chargeRequest]);
  assert.equal((await db.query("select count(*)::int as count from public.chapter_receivables")).rows[0].count, 1);
  assert.equal((await db.query("select notes from public.chapter_receivables")).rows[0].notes, "Invited member note");
  const chargeId = first.rows[0].result.ids[0];
  const creditRequest = randomUUID();
  await db.query("select public.mcp_admin_write('record_credit', $1::jsonb, $2, false)", [JSON.stringify({ chargeId, amount: 20 }), creditRequest]);
  await db.query("select public.mcp_admin_write('record_credit', $1::jsonb, $2, false)", [JSON.stringify({ chargeId, amount: 20 }), creditRequest]);
  assert.equal(Number((await db.query("select amount_paid from public.chapter_receivables")).rows[0].amount_paid), 20);
  await assert.rejects(
    db.query("select public.mcp_admin_write('delete_charges', $1::jsonb, null, null)", [JSON.stringify({ chargeIds: [chargeId] })]),
    /Confirmation is required/,
  );
  await db.query("select public.mcp_admin_write('bulk_set_charges_paid', $1::jsonb, null, true)", [JSON.stringify({ chargeIds: [chargeId] })]);
  assert.equal(Number((await db.query("select amount_paid from public.chapter_receivables")).rows[0].amount_paid), 50);
  await db.query("select public.mcp_admin_write('set_budget', $1::jsonb, null, false)", [JSON.stringify({ category: "administration", amount: null })]);
  const budgets = (await db.query("select category_amounts from public.reimbursement_budgets where id")).rows[0].category_amounts;
  assert.equal(budgets.administration, null);
  assert.equal(budgets.miscellaneous_fees, null);

  const externalRequest = randomUUID();
  const externalPayload = JSON.stringify({ chargeIds: [chargeId] });
  const firstAttempt = await db.query("select public.mcp_begin_external('send_dues_announcement', $1::jsonb, $2, true) as result", [externalPayload, externalRequest]);
  assert.equal(firstAttempt.rows[0].result.shouldSend, true);
  const concurrentAttempt = await db.query("select public.mcp_begin_external('send_dues_announcement', $1::jsonb, $2, true) as result", [externalPayload, externalRequest]);
  assert.deepEqual(concurrentAttempt.rows[0].result, { shouldSend: false, status: "in_progress" });
  await db.query("select public.mcp_finish_external($1, false, '{}'::jsonb)", [externalRequest]);
  const retry = await db.query("select public.mcp_begin_external('send_dues_announcement', $1::jsonb, $2, true) as result", [externalPayload, externalRequest]);
  assert.equal(retry.rows[0].result.shouldSend, true);
  await db.query("select public.mcp_finish_external($1, true, $2::jsonb)", [externalRequest, JSON.stringify({ messageId: "sent" })]);
  const completed = await db.query("select public.mcp_begin_external('send_dues_announcement', $1::jsonb, $2, true) as result", [externalPayload, externalRequest]);
  assert.equal(completed.rows[0].result.shouldSend, false);
  assert.equal(completed.rows[0].result.status, "succeeded");
  assert.equal((await db.query("select count(*)::int as count from public.mcp_audit_log where tool_name in ('add_charges', 'record_credit')")).rows[0].count, 2);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: invitedId, client_id: "client-id" })]);
  await assert.rejects(
    db.query("select public.mcp_admin_write('set_budget', $1::jsonb, null, false)", [JSON.stringify({ category: "administration", amount: 100 })]),
    /administrator OAuth grant is required/,
  );
});

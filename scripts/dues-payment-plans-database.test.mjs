import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("payment plans preserve charge history, enforce terms and authorization, and reject stale changes", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.is_admin() returns boolean language sql as $$ select true $$;
    create table public.profiles (id uuid primary key);
    create table public.chapter_receivables (
      id uuid primary key, amount_assessed numeric(12,2) not null,
      amount_paid numeric(12,2) not null default 0, due_date date not null,
      notes text not null default '', updated_at timestamptz not null default now()
    );
    create function public.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = clock_timestamp(); return new; end;
    $$;
    create trigger chapter_receivables_set_updated_at before update on public.chapter_receivables
      for each row execute function public.set_updated_at();
  `);
  const migration = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
  await db.exec(await migration("20260915020000_atomic_dues_payments"));
  const finance = await migration("20260922000000_finance_plan_actual");
  await db.exec(finance.slice(0, finance.indexOf("alter table public.reimbursements")));
  await db.exec(await migration("20261008000000_dues_payment_plans"));
  const id = randomUUID();
  await db.query("insert into public.chapter_receivables (id,amount_assessed,due_date,notes) values ($1,1000,'2026-10-01','Original note')", [id]);
  const get = async () => (await db.query("select *, updated_at::text as version from public.chapter_receivables where id=$1", [id])).rows[0];
  const setPlan = async (frequency, amount, interval = null, version = null) => db.query(
    "select public.set_receivable_payment_plan($1,$2,$3,$4,$5) as saved",
    [id, version ?? (await get()).version, frequency, amount, interval],
  );
  const pay = (amount, requestId = randomUUID()) => db.query("select public.record_dues_payment($1,$2,'2026-10-06',$3) as recorded", [id, amount, requestId]);

  const original = await get();
  assert.equal(original.payment_plan_frequency, null);
  assert.equal(original.payment_plan_amount, null);
  assert.equal(original.payment_plan_interval_days, null);
  assert.equal((await setPlan("monthly", 250)).rows[0].saved, true);
  await assert.rejects(setPlan("weekly", 100, null, original.version), /changed/);
  let row = await get();
  assert.equal(row.payment_plan_frequency, "monthly");
  assert.equal(row.payment_plan_amount, "250.00");
  assert.equal(row.amount_assessed, original.amount_assessed);
  assert.equal(row.amount_paid, original.amount_paid);
  assert.equal(row.due_date.getTime(), original.due_date.getTime());
  assert.equal(row.notes, "Original note");
  assert.equal((await db.query("select count(*) from public.chapter_dues_payment_events")).rows[0].count, 0);

  const requestId = randomUUID();
  assert.equal((await pay(250, requestId)).rows[0].recorded, true);
  assert.equal((await pay(250, requestId)).rows[0].recorded, true);
  row = await get();
  assert.equal(row.amount_paid, "250.00");
  assert.equal(row.payment_plan_amount, "250.00");
  assert.equal((await db.query("select count(*) from public.chapter_dues_payment_events")).rows[0].count, 1);

  for (const [frequency, amount, interval] of [
    ["daily", 100, null], ["monthly", 0, null], ["monthly", -1, null],
    ["monthly", "NaN", null], ["monthly", 1000000000, null], ["monthly", 1.001, null],
    ["monthly", 100, 3], ["custom", 100, null], ["custom", 100, 0], ["custom", 100, -1], [null, 100, null],
  ]) await assert.rejects(setPlan(frequency, amount, interval));
  // Constraints also protect direct writes that bypass the RPC.
  await assert.rejects(db.query("update public.chapter_receivables set payment_plan_frequency=null where id=$1", [id]), /check constraint/);
  await assert.rejects(db.query("update public.chapter_receivables set payment_plan_frequency='custom' where id=$1", [id]), /check constraint/);
  for (const frequency of ["weekly", "biweekly"]) assert.equal((await setPlan(frequency, 125)).rows[0].saved, true);
  assert.equal((await setPlan("custom", 125, 10)).rows[0].saved, true);
  assert.equal((await get()).payment_plan_interval_days, 10);
  await setPlan(null, null);
  row = await get();
  assert.equal(row.payment_plan_frequency, null);
  assert.equal(row.payment_plan_amount, null);
  assert.equal(row.payment_plan_interval_days, null);
  assert.equal(row.amount_paid, "250.00");

  await db.exec("create or replace function public.is_admin() returns boolean language sql as $$ select false $$;");
  await assert.rejects(setPlan("monthly", 250), /Administrator access required/);
  await db.exec("create or replace function public.is_admin() returns boolean language sql as $$ select true $$;");
  const grants = (await db.query("select has_function_privilege('anon','public.set_receivable_payment_plan(uuid,timestamptz,text,numeric,integer)','execute') as anon, has_function_privilege('authenticated','public.set_receivable_payment_plan(uuid,timestamptz,text,numeric,integer)','execute') as authenticated")).rows[0];
  assert.deepEqual(grants, { anon: false, authenticated: true });

  await setPlan("monthly", 250);
  await pay(750);
  assert.equal((await get()).payment_plan_amount, "250.00");
  await assert.rejects(setPlan(null, null), /outstanding charges/);
  await db.query("select public.set_dues_paid_state($1,false,'2026-10-06')", [id]);
  assert.equal((await get()).payment_plan_frequency, "monthly");
  assert.equal((await setPlan("monthly", 100)).rows[0].saved, true);
  await db.query("update public.chapter_receivables set waived_at=now() where id=$1", [id]);
  await assert.rejects(setPlan("monthly", 250), /changed/);
});

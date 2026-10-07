import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { paymentPlanDueDate } from "../lib/reimbursements/dues-payment-plan.ts";

test("schedules reconcile old plans and track installments atomically without changing payment history", async (t) => {
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
  const bulk = await migration("20260923000000_atomic_bulk_receivable_edits");
  await db.exec(bulk.slice(bulk.indexOf("create function public.bulk_change_receivable_state")));
  await db.exec(await migration("20261008000000_dues_payment_plans"));
  const get = async (id) => (await db.query("select *, due_date::text as due, payment_plan_start_date::text as start, updated_at::text as version from public.chapter_receivables where id=$1", [id])).rows[0];
  const oldId = randomUUID();
  await db.query("insert into public.chapter_receivables(id,amount_assessed,due_date,notes,payment_plan_frequency,payment_plan_amount) values($1,1000,'2026-09-17','Keep charge reason','monthly',250)", [oldId]);
  await db.query("select public.record_dues_payment($1,250,'2026-09-17',$2)", [oldId, randomUUID()]);
  await db.query("update public.chapter_dues_payment_events set date_is_estimated=true where receivable_id=$1", [oldId]);
  const eventsBefore = (await db.query("select * from public.chapter_dues_payment_events")).rows;
  await db.exec(await migration("20261010000000_dues_payment_plan_scheduling"));
  assert.deepEqual((await db.query("select * from public.chapter_dues_payment_events")).rows, eventsBefore);
  let row = await get(oldId);
  assert.equal(row.start, "2026-09-17");
  assert.equal(row.due, "2026-10-17");
  assert.equal(row.amount_paid, "250.00");
  assert.equal(row.amount_assessed, "1000.00");
  assert.equal(row.payment_plan_amount, "250.00");
  assert.equal(row.notes, "Keep charge reason");

  const create = async (start = "2026-09-17", frequency = "monthly", amount = 250, assessed = 1000, interval = null) => {
    const id = randomUUID();
    await db.query("insert into public.chapter_receivables(id,amount_assessed,due_date,payment_plan_frequency,payment_plan_amount,payment_plan_interval_days) values($1,$2,$3,$4,$5,$6)", [id, assessed, start, frequency, amount, interval]);
    return id;
  };
  const pay = (id, amount, request = randomUUID(), date = "2026-10-06") => db.query("select public.record_dues_payment($1,$2,$3,$4) as recorded", [id, amount, date, request]);
  const setPlan = async (id, frequency, amount, interval = null, start = null, version = null) => db.query("select public.set_receivable_payment_plan($1,$2,$3,$4,$5,$6)", [id, version ?? (await get(id)).version, frequency, amount, interval, start]);
  const id = await create();
  await pay(id, 125);
  assert.equal((await get(id)).due, "2026-09-17");
  const retry = randomUUID();
  await pay(id, 125, retry, "2026-08-01");
  assert.equal((await get(id)).due, "2026-10-17");
  const retryVersion = (await get(id)).version;
  await pay(id, 125, retry);
  assert.equal((await get(id)).due, "2026-10-17");
  assert.equal((await get(id)).version, retryVersion);
  await pay(id, 500);
  assert.equal((await get(id)).due, "2026-12-17");
  await pay(id, 250);
  assert.equal((await get(id)).due, "2026-12-17");
  await assert.rejects(setPlan(id, "monthly", 100), /outstanding/);
  await db.query("select public.set_dues_paid_state($1,false,'2026-10-06')", [id]);
  assert.equal((await get(id)).due, "2026-09-17");
  assert.equal((await get(id)).amount_paid, "0.00");
  const history = (await db.query("select amount,paid_date::text,date_is_estimated from public.chapter_dues_payment_events where receivable_id=$1 order by paid_date desc,created_at desc,id", [id])).rows;
  assert.equal(history.length, 5);
  assert.ok(history.some((event) => event.amount === "-1000.00"));
  assert.equal(history.at(-1).paid_date, "2026-08-01");

  // Non-multiple final installment stays on its scheduled date.
  const final = await create("2026-01-31", "monthly", 250, 725);
  await pay(final, 500);
  assert.equal((await get(final)).due, "2026-03-31");
  await pay(final, 225);
  assert.equal((await get(final)).due, "2026-03-31");

  for (const [start, frequency, interval, expected] of [
    ["2026-01-31", "monthly", null, ["2026-02-28", "2026-03-31"]],
    ["2028-01-31", "monthly", null, ["2028-02-29", "2028-03-31"]],
    ["2026-12-31", "monthly", null, ["2027-01-31", "2027-02-28"]],
    ["2026-09-17", "weekly", null, ["2026-09-24", "2026-10-01"]],
    ["2026-09-17", "biweekly", null, ["2026-10-01", "2026-10-15"]],
    ["2026-09-17", "custom", 10, ["2026-09-27", "2026-10-07"]],
  ]) {
    const charge = await create(start, frequency, 250, 1000, interval);
    for (let i = 0; i < expected.length; i++) {
      await pay(charge, 250);
      assert.equal((await get(charge)).due, expected[i]);
      assert.equal(paymentPlanDueDate(start, { frequency, amount: 250, intervalDays: interval }, 250 * (i + 1), 1000), expected[i]);
    }
  }
  await pay(id, 250);
  const stale = (await get(id)).version;
  await setPlan(id, "monthly", 125);
  assert.equal((await get(id)).due, "2026-11-17");
  await assert.rejects(setPlan(id, "weekly", 250, null, null, stale), /changed/);
  await setPlan(id, "weekly", 125);
  assert.equal((await get(id)).due, "2026-10-01");
  await setPlan(id, null, null);
  assert.equal((await get(id)).due, "2026-10-01");
  assert.equal((await get(id)).start, "2026-09-17");
  await setPlan(id, "weekly", 125);
  assert.equal((await get(id)).due, "2026-10-01");
  await setPlan(id, "weekly", 125, null, "2026-10-10");
  assert.equal((await get(id)).due, "2026-10-24");
  await db.query("update public.chapter_receivables set due_date='2026-11-01' where id=$1", [id]);
  assert.equal((await get(id)).start, "2026-11-01");
  assert.equal((await get(id)).due, "2026-11-15");
  row = await get(id);
  await db.query("select public.bulk_update_receivables($1::jsonb,$2,null,null,true,false,false)", [JSON.stringify([{ id, updated_at: row.version }]), row.due]);
  assert.equal((await get(id)).start, "2026-11-15");
  assert.equal((await get(id)).due, "2026-11-29");
  await setPlan(id, null, null);
  await db.query("update public.chapter_receivables set due_date='2027-01-01' where id=$1", [id]);
  await setPlan(id, "weekly", 125);
  assert.equal((await get(id)).due, "2027-01-15");

  row = await get(id);
  await db.query("select public.bulk_change_receivable_state($1::jsonb,'paid','2026-10-06')", [JSON.stringify([{ id, updated_at: row.version }])]);
  assert.equal((await get(id)).due, "2027-02-19");
  row = await get(id);
  await db.query("select public.bulk_change_receivable_state($1::jsonb,'reopened','2026-10-06')", [JSON.stringify([{ id, updated_at: row.version }])]);
  assert.equal((await get(id)).due, "2027-01-01");

  const concurrent = await create();
  await Promise.all([pay(concurrent, 125), pay(concurrent, 125), pay(concurrent, 250)]);
  assert.equal((await get(concurrent)).amount_paid, "500.00");
  assert.equal((await get(concurrent)).due, "2026-11-17");
  assert.equal((await db.query("select count(*) from public.chapter_dues_payment_events where receivable_id=$1", [concurrent])).rows[0].count, 3);
  await db.query("update public.chapter_receivables set amount_paid=750 where id=$1", [concurrent]);
  assert.equal((await get(concurrent)).due, "2026-12-17");
  await db.query("update public.chapter_receivables set amount_assessed=2000 where id=$1", [concurrent]);
  assert.equal((await get(concurrent)).due, "2026-12-17");

  const overflow = await create("9999-12-31", "custom", 250, 1000, 2147483647);
  await assert.rejects(pay(overflow, 250), /supported date range/);
  assert.equal((await get(overflow)).amount_paid, "0.00");
  assert.equal((await db.query("select count(*) from public.chapter_dues_payment_events where receivable_id=$1", [overflow])).rows[0].count, 0);
  await assert.rejects(setPlan(id, "monthly", 250, null, "infinity"), /valid first installment/);
  await db.exec("create or replace function public.is_admin() returns boolean language sql as $$ select false $$");
  await assert.rejects(setPlan(id, "monthly", 250), /Administrator/);
  const permissions = (await db.query("select has_function_privilege('anon','public.set_receivable_payment_plan(uuid,timestamptz,text,numeric,integer,date)','execute') as anon, has_function_privilege('authenticated','public.set_receivable_payment_plan(uuid,timestamptz,text,numeric,integer,date)','execute') as authenticated")).rows[0];
  assert.deepEqual(permissions, { anon: false, authenticated: true });
});

test("schedule previews reject impossible dates and match final installment rules", () => {
  const plan = { frequency: "monthly", amount: 250, intervalDays: null };
  assert.equal(paymentPlanDueDate("2026-02-30", plan, 0, 1000), null);
  assert.equal(paymentPlanDueDate("0000-01-01", plan, 0, 1000), null);
  assert.equal(paymentPlanDueDate("9999-12-31", plan, 250, 1000), null);
  assert.equal(paymentPlanDueDate("2026-01-31", plan, 725, 725), "2026-03-31");
  assert.equal(paymentPlanDueDate("2026-01-31", plan, 100, 100), "2026-01-31");
  assert.equal(paymentPlanDueDate("2026-01-31", { ...plan, amount: 0 }, 250, 1000), null);
  assert.equal(paymentPlanDueDate("2026-01-31", { ...plan, frequency: "custom", intervalDays: 2147483647 }, 250, 1000), null);
});

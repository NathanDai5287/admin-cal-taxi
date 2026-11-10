import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("partial dues payments preserve totals, dates, retry safety, and the remaining balance", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('test.user_id', true), '')::uuid
    $$;
    create function public.is_admin() returns boolean language sql as $$ select true $$;
    create table public.profiles (id uuid primary key, full_name text, email text);
    create table public.chapter_receivables (
      id uuid primary key, amount_assessed numeric(12,2) not null,
      amount_paid numeric(12,2) not null default 0, due_date date not null,
      updated_at timestamptz not null default now()
    );
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20260915020000_atomic_dues_payments.sql", import.meta.url), "utf8"));
  const finance = await readFile(new URL("../supabase/migrations/20260922000000_finance_plan_actual.sql", import.meta.url), "utf8");
  await db.exec(finance.slice(0, finance.indexOf("alter table public.reimbursements")));
  const recorderId = randomUUID();
  await db.query("insert into public.profiles values ($1, '  Pat Treasurer  ', 'pat@example.com')", [recorderId]);
  const id = randomUUID();
  await db.query("insert into public.chapter_receivables (id,amount_assessed,amount_paid,due_date) values ($1,1000,250,'2026-10-01')", [id]);
  // A pre-migration event must keep its amount and date without invented attribution.
  await db.query("insert into public.chapter_dues_payment_events (receivable_id,amount,paid_date) values ($1,250,'2026-10-01')", [id]);
  await db.exec(await readFile(new URL("../supabase/migrations/20261109000000_dues_payment_recorders.sql", import.meta.url), "utf8"));
  await db.query("select set_config('test.user_id', $1, false)", [recorderId]);
  const requestId = randomUUID();
  async function pay(amount, request = randomUUID()) {
    const { rows } = await db.query("select public.record_dues_payment($1,$2,'2026-10-03',$3) as recorded", [id, amount, request]);
    return rows[0].recorded;
  }
  assert.equal(await pay(250, requestId), true);
  assert.equal(await pay(250, requestId), true);
  let result = await db.query("select amount_assessed, amount_paid, amount_assessed-amount_paid as remaining from public.chapter_receivables where id=$1", [id]);
  assert.deepEqual(result.rows[0], { amount_assessed: "1000.00", amount_paid: "500.00", remaining: "500.00" });
  const events = await db.query("select amount, paid_date::text, recorded_by, recorder_name from public.chapter_dues_payment_events where receivable_id=$1 order by paid_date", [id]);
  assert.deepEqual(events.rows, [
    { amount: "250.00", paid_date: "2026-10-01", recorded_by: null, recorder_name: null },
    { amount: "250.00", paid_date: "2026-10-03", recorded_by: recorderId, recorder_name: "Pat Treasurer" },
  ]);
  assert.equal(await pay(501), false);
  assert.equal(await pay(0), false);
  assert.equal(await pay(-1), false);
  assert.equal(await pay(500), true);
  result = await db.query("select amount_paid from public.chapter_receivables where id=$1", [id]);
  assert.equal(result.rows[0].amount_paid, "1000.00");
  assert.equal(await pay(1), false);
  // Snapshot names survive renames; reversals use the person performing them.
  await db.query("update public.profiles set full_name='Alex Treasurer' where id=$1", [recorderId]);
  await db.query("select public.set_dues_paid_state($1, false, '2026-10-04')", [id]);
  const reversal = await db.query("select amount, recorder_name from public.chapter_dues_payment_events where amount < 0");
  assert.deepEqual(reversal.rows, [{ amount: "-1000.00", recorder_name: "Alex Treasurer" }]);
  await db.query("update public.profiles set full_name='  ' where id=$1", [recorderId]);
  await db.query("select public.set_dues_paid_state($1, true, '2026-10-05')", [id]);
  const markedPaid = await db.query("select recorder_name from public.chapter_dues_payment_events where paid_date='2026-10-05'");
  assert.equal(markedPaid.rows[0].recorder_name, "pat@example.com");
  await db.query("delete from public.profiles where id=$1", [recorderId]);
  const snapshot = await db.query("select recorded_by, recorder_name from public.chapter_dues_payment_events where paid_date='2026-10-03' order by amount");
  assert.ok(snapshot.rows.every((row) => row.recorded_by === null && row.recorder_name === "Pat Treasurer"));
});

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
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.is_admin() returns boolean language sql as $$ select true $$;
    create table public.profiles (id uuid primary key);
    create table public.chapter_receivables (
      id uuid primary key, amount_assessed numeric(12,2) not null,
      amount_paid numeric(12,2) not null default 0, due_date date not null,
      updated_at timestamptz not null default now()
    );
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20260915020000_atomic_dues_payments.sql", import.meta.url), "utf8"));
  const finance = await readFile(new URL("../supabase/migrations/20260922000000_finance_plan_actual.sql", import.meta.url), "utf8");
  await db.exec(finance.slice(0, finance.indexOf("alter table public.reimbursements")));
  const id = randomUUID();
  await db.query("insert into public.chapter_receivables (id,amount_assessed,amount_paid,due_date) values ($1,1000,250,'2026-10-01')", [id]);
  const requestId = randomUUID();
  async function pay(amount, request = randomUUID()) {
    const { rows } = await db.query("select public.record_dues_payment($1,$2,'2026-10-03',$3) as recorded", [id, amount, request]);
    return rows[0].recorded;
  }
  assert.equal(await pay(250, requestId), true);
  assert.equal(await pay(250, requestId), true);
  let result = await db.query("select amount_assessed, amount_paid, amount_assessed-amount_paid as remaining from public.chapter_receivables where id=$1", [id]);
  assert.deepEqual(result.rows[0], { amount_assessed: "1000.00", amount_paid: "500.00", remaining: "500.00" });
  const events = await db.query("select amount, paid_date::text from public.chapter_dues_payment_events where receivable_id=$1", [id]);
  assert.deepEqual(events.rows, [{ amount: "250.00", paid_date: "2026-10-03" }]);
  assert.equal(await pay(501), false);
  assert.equal(await pay(0), false);
  assert.equal(await pay(-1), false);
  assert.equal(await pay(500), true);
  result = await db.query("select amount_paid from public.chapter_receivables where id=$1", [id]);
  assert.equal(result.rows[0].amount_paid, "1000.00");
  assert.equal(await pay(1), false);
});

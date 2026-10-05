import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("deposit ledger enforces limits, idempotency, cancellation, immutable history and service-only access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key,role text);
      create table hosting_finance_orders(order_id text primary key,status text);
      create table hosting_event_state(order_id text primary key,cancelled_at timestamptz);
      create table hosting_email_deliveries(kind text constraint hosting_email_deliveries_kind_check check(kind in ('receipt')));
      insert into profiles values('00000000-0000-4000-8000-000000000001','admin'),('00000000-0000-4000-8000-000000000002','member');
      insert into hosting_finance_orders values('order','confirmed'),('cancelled','cancelled');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261006002000_hosting_deposit_receipts.sql", import.meta.url), "utf8"));
    const admin = "00000000-0000-4000-8000-000000000001";
    const request = "00000000-0000-4000-8000-000000000003";
    const pay = (amount, key = request, order = "order", user = admin) => db.query("select record_hosting_deposit($1,$2,300,current_date,$3,$4) as id", [order, amount, key, user]);
    await assert.rejects(pay(300, request, "order", "00000000-0000-4000-8000-000000000002"), /Administrator/);
    await assert.rejects(pay(300, request, "cancelled"), /active sent/);
    const paid = await pay(300);
    assert.equal((await pay(300)).rows[0].id, paid.rows[0].id);
    await assert.rejects(pay(125), /different deposit/);
    await assert.rejects(pay(1, "00000000-0000-4000-8000-000000000004"), /exceeds/);
    await assert.rejects(db.exec("update hosting_deposit_payments set amount=1"), /immutable/);
    await db.exec("update hosting_deposit_payments set reversed_at=now(),reversal_reason='Paid status undone'");
    await assert.rejects(db.exec("update hosting_deposit_payments set reversed_at=null"), /immutable/);
    await pay(300, "00000000-0000-4000-8000-000000000004");
    assert.equal(Number((await db.query("select sum(amount) as total from hosting_deposit_payments where reversed_at is null")).rows[0].total), 300);
    assert.equal((await db.query("select count(*)::int as count from hosting_deposit_payments")).rows[0].count, 2);
    const privileges = await db.query("select has_function_privilege('authenticated','public.record_hosting_deposit(text,numeric,numeric,date,uuid,uuid)','execute') as browser,has_function_privilege('service_role','public.record_hosting_deposit(text,numeric,numeric,date,uuid,uuid)','execute') as server,has_table_privilege('authenticated','hosting_deposit_payments','insert') as writes");
    assert.deepEqual(privileges.rows[0], { browser: false, server: true, writes: false });
    await db.exec("insert into hosting_email_deliveries values('deposit_receipt')");
  } finally { await db.close(); }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table profiles(id uuid primary key, removed_at timestamptz);
    create table hosting_finance_orders(order_id text primary key, status text not null);
    create table hosting_event_state(
      order_id text primary key, cancelled_at timestamptz, refund_amount numeric(12,2), refund_date date, refund_method text,
      constraint hosting_event_state_refund_amount_check check(refund_amount > 0),
      check ((refund_amount is null and refund_date is null and refund_method is null) or (refund_amount is not null and refund_date is not null and length(trim(refund_method)) > 0))
    );
    create table hosting_email_deliveries(kind text not null, constraint hosting_email_deliveries_kind_check check(kind in ('refund')));
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261101000000_hosting_damage_settlements.sql", import.meta.url), "utf8"));
  await db.exec(`
    insert into profiles values('00000000-0000-4000-8000-000000000001',null);
    insert into hosting_finance_orders values('ord_settlement','confirmed');
  `);
  return db;
}

const userId = "00000000-0000-4000-8000-000000000001";
const trimId = "00000000-0000-4000-8000-000000000101";
const toiletId = "00000000-0000-4000-8000-000000000102";
const items = [
  { id: trimId, category: "damage", description: "Doorway trim repair", amount: 100, clubs: ["Alpha"], position: 0 },
  { id: toiletId, category: "plumbing", description: "Toilet and restroom remediation", amount: 50, clubs: ["Alpha", "Beta"], position: 1 },
];

async function save(db, nextItems = items) {
  return db.query("select save_hosting_damage_settlement($1,$2,$3,$4,$5::jsonb,$6) id", ["ord_settlement", 250, "Zelle", "2026-11-01", JSON.stringify(nextItems), userId]);
}

test("itemized settlement saves a capped, attributable draft", async (t) => {
  const db = await database();
  t.after(() => db.close());
  const result = await save(db);
  const settlementId = result.rows[0].id;
  const rows = await db.query("select description,amount,responsible_clubs,position from hosting_damage_items where settlement_id=$1 order by position", [settlementId]);
  assert.deepEqual(rows.rows.map(row => ({ ...row, amount: Number(row.amount) })), [
    { description: "Doorway trim repair", amount: 100, responsible_clubs: ["Alpha"], position: 0 },
    { description: "Toilet and restroom remediation", amount: 50, responsible_clubs: ["Alpha", "Beta"], position: 1 },
  ]);
  await assert.rejects(save(db, [{ ...items[0], amount: 251 }]), /Deductions cannot exceed/);
});

test("saving a revision preserves evidence attached to retained deduction IDs", async (t) => {
  const db = await database();
  t.after(() => db.close());
  const settlementId = (await save(db)).rows[0].id;
  await db.query("insert into hosting_damage_evidence(settlement_id,item_id,storage_path,filename,content_type,byte_size) values($1,$2,'path/photo.jpg','photo.jpg','image/jpeg',100)", [settlementId, trimId]);
  await save(db, [{ ...items[0], amount: 110 }, items[1]]);
  const evidence = await db.query("select item_id from hosting_damage_evidence where settlement_id=$1", [settlementId]);
  assert.equal(evidence.rows[0].item_id, trimId);
});

test("sent settlements are immutable and zero-dollar returns are valid", async (t) => {
  const db = await database();
  t.after(() => db.close());
  const settlementId = (await save(db)).rows[0].id;
  await db.query("update hosting_damage_settlements set status='sent' where id=$1", [settlementId]);
  await assert.rejects(save(db), /sent settlement is immutable/);
  await db.exec("insert into hosting_event_state(order_id,refund_amount,refund_date,refund_method) values('ord_settlement',0,'2026-11-01','Deposit retained')");
  const state = await db.query("select refund_amount from hosting_event_state where order_id='ord_settlement'");
  assert.equal(Number(state.rows[0].refund_amount), 0);
});

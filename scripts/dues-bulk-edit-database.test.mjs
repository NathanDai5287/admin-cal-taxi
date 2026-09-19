import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

async function setupDatabase(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.is_admin() returns boolean language sql as $$ select true $$;
    create table public.profiles (
      id uuid primary key,
      email text not null,
      full_name text,
      role text not null,
      removed_at timestamptz,
      discord_user_id text
    );
    create table public.chapter_receivables (
      id uuid primary key,
      member_id uuid,
      member_name text not null default 'Original member',
      discord_user_id text,
      amount_assessed numeric(12, 2) not null,
      amount_paid numeric(12, 2) not null default 0,
      due_date date not null,
      notes text not null default '',
      waived_at timestamptz,
      updated_at timestamptz not null default now()
    );
  `);
  const migrations = await Promise.all([
    "20260923000000_atomic_bulk_receivable_edits.sql",
    "20260924000000_remove_bulk_receivable_member_edit.sql",
  ].map((file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")));
  await db.exec(migrations.join("\n"));
  return db;
}

async function insertCharge(db, { amount = 100, paid = 0 } = {}) {
  const id = randomUUID();
  await db.query(
    "insert into public.chapter_receivables (id, amount_assessed, amount_paid, due_date, notes) values ($1, $2, $3, '2026-09-30', 'Original')",
    [id, amount, paid],
  );
  const { rows } = await db.query("select id, updated_at from public.chapter_receivables where id = $1", [id]);
  return rows[0];
}

async function bulkEdit(db, rows, values = {}) {
  return db.query(
    "select public.bulk_update_receivables($1, $2, $3, $4, $5, $6, $7)",
    [
      JSON.stringify(rows),
      values.dueDate ?? null,
      values.amount ?? null,
      values.notes ?? "",
      values.applyDueDate ?? false,
      values.applyAmount ?? false,
      values.applyNotes ?? false,
    ],
  );
}

test("bulk charge edits change only enabled fields", async (t) => {
  const db = await setupDatabase(t);
  const charge = await insertCharge(db);

  await bulkEdit(db, [charge], { notes: "Shared reason", applyNotes: true });

  const { rows } = await db.query("select amount_assessed, due_date::text, notes from public.chapter_receivables where id = $1", [charge.id]);
  assert.deepEqual(rows[0], { amount_assessed: "100.00", due_date: "2026-09-30", notes: "Shared reason" });
});

test("bulk charge validation rejects every selected change", async (t) => {
  const db = await setupDatabase(t);
  const first = await insertCharge(db, { paid: 80 });
  const second = await insertCharge(db);

  await assert.rejects(
    bulkEdit(db, [first, second], { amount: 50, dueDate: "2026-10-20", applyAmount: true, applyDueDate: true }),
    /below payments/,
  );

  const { rows } = await db.query("select due_date::text from public.chapter_receivables order by id");
  assert.deepEqual(rows.map((row) => row.due_date), ["2026-09-30", "2026-09-30"]);
});

test("bulk amount edits preserve payments and reject paid charge changes", async (t) => {
  const db = await setupDatabase(t);
  const partial = await insertCharge(db, { amount: 100, paid: 40 });
  await bulkEdit(db, [partial], { amount: 150, applyAmount: true });
  const partialResult = await db.query("select amount_assessed, amount_paid from public.chapter_receivables where id = $1", [partial.id]);
  assert.deepEqual(partialResult.rows[0], { amount_assessed: "150.00", amount_paid: "40.00" });

  const paid = await insertCharge(db, { amount: 100, paid: 100 });
  await assert.rejects(bulkEdit(db, [paid], { amount: 120, applyAmount: true }), /fully paid/);
  await bulkEdit(db, [paid], { dueDate: "2026-10-20", notes: "Date moved", applyDueDate: true, applyNotes: true });
  const paidResult = await db.query("select amount_assessed, due_date::text, notes from public.chapter_receivables where id = $1", [paid.id]);
  assert.deepEqual(paidResult.rows[0], { amount_assessed: "100.00", due_date: "2026-10-20", notes: "Date moved" });
});

test("bulk charge edits reject stale row versions", async (t) => {
  const db = await setupDatabase(t);
  const charge = await insertCharge(db);
  await db.query("update public.chapter_receivables set updated_at = updated_at + interval '1 second' where id = $1", [charge.id]);

  await assert.rejects(bulkEdit(db, [charge], { notes: "Stale", applyNotes: true }), /changed/);
  const { rows } = await db.query("select notes from public.chapter_receivables where id = $1", [charge.id]);
  assert.equal(rows[0].notes, "Original");
});

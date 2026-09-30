import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

async function setupDatabase(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.profiles (
      id uuid primary key,
      role text not null,
      removed_at timestamptz
    );
    create table public.reimbursements (
      id uuid primary key,
      user_id uuid,
      status text not null default 'pending',
      merchant text,
      receipt_date date,
      receipt_total numeric,
      failure_reason text
    );
    alter table public.reimbursements enable row level security;
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/20260929000000_reimbursement_denial_reasons.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  return db;
}

async function insertSubmission(db, { status = "verified", denialReason = null } = {}) {
  const id = randomUUID();
  await db.query(
    "insert into public.reimbursements (id, status, denial_reason) values ($1, $2, $3)",
    [id, status, denialReason],
  );
  return id;
}

async function denialReasonOf(db, id) {
  const { rows } = await db.query("select denial_reason from public.reimbursements where id = $1", [id]);
  return rows[0]?.denial_reason;
}

test("denying with a note stores the reason", async (t) => {
  const db = await setupDatabase(t);
  const id = await insertSubmission(db);
  await db.query("update public.reimbursements set status = 'denied', denial_reason = 'Receipt is illegible' where id = $1", [id]);
  assert.equal(await denialReasonOf(db, id), "Receipt is illegible");
});

test("reversing a denial clears the reason", async (t) => {
  const db = await setupDatabase(t);
  const id = await insertSubmission(db, { status: "denied", denialReason: "Not covered" });
  assert.equal(await denialReasonOf(db, id), "Not covered");
  await db.query("update public.reimbursements set status = 'approved' where id = $1", [id]);
  assert.equal(await denialReasonOf(db, id), null);
});

test("a reason can never land on a non-denied submission", async (t) => {
  const db = await setupDatabase(t);
  const id = await insertSubmission(db, { status: "approved", denialReason: "sneaky" });
  assert.equal(await denialReasonOf(db, id), null);
});

test("denial notes are optional but bounded", async (t) => {
  const db = await setupDatabase(t);
  const withoutNote = await insertSubmission(db, { status: "denied" });
  assert.equal(await denialReasonOf(db, withoutNote), null);

  await assert.rejects(
    db.query("insert into public.reimbursements (id, status, denial_reason) values ($1, 'denied', '')", [randomUUID()]),
    /reimbursements_denial_reason_check/,
  );
  await assert.rejects(
    db.query("insert into public.reimbursements (id, status, denial_reason) values ($1, 'denied', repeat('x', 501))", [randomUUID()]),
    /reimbursements_denial_reason_check/,
  );
});

test("members cannot prefill a denial note on submission", async (t) => {
  const db = await setupDatabase(t);
  const { rows } = await db.query(
    "select pg_get_expr(polwithcheck, polrelid) as qual from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid where relname = 'reimbursements' and polname = 'members can submit reimbursements for themselves'",
  );
  assert.match(rows[0]?.qual ?? "", /denial_reason is null/i);
});

test("the review action validates and stores the denial note", async () => {
  const actions = await readFile(new URL("../app/(admin)/finance/review/actions.ts", import.meta.url), "utf8");

  assert.match(actions, /denialReason: z\.string\(\)\.trim\(\)\.max\(500\)\.optional\(\)/);
  assert.match(actions, /denial_reason: parsed\.data\.status === "denied" \? parsed\.data\.denialReason \|\| null : null/);
});

test("denial prompts and member-facing reason stay wired", async () => {
  const [buttons, paymentTable, reviewPage, detailData, detailView, detailLoading, memberPage] = await Promise.all([
    readFile(new URL("../components/reimbursements/review-decision-buttons.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/reimbursements/reimbursement-payment-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/finance/review/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/reimbursements/payable-detail-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/reimbursements/payable-detail-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/reimbursements/payable-detail-loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/submit/history/[id]/page.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [buttons, paymentTable]) {
    assert.match(source, /Why is this being denied\? \(optional\)/);
  }
  assert.match(reviewPage, /denial_reason/);
  assert.match(detailData, /denialReason: row\.denial_reason \?\? ""/);
  assert.match(detailView, /initialDenialReason=\{detail\.denialReason\}/);
  assert.match(reviewPage, /<PayableDetailView detail=\{detail\}/);
  assert.match(detailLoading, /<PayableDetailView detail=\{selected\}/);
  assert.match(memberPage, /denial_reason/);
  assert.match(memberPage, /Reason for denial/);
});

test("the paid checkbox is only clickable for approved reimbursements", async () => {
  const paymentTable = await readFile(new URL("../components/reimbursements/reimbursement-payment-table.tsx", import.meta.url), "utf8");
  const payableActions = await readFile(new URL("../app/(admin)/finance/accounts/payable/actions.ts", import.meta.url), "utf8");

  assert.match(paymentTable, /disabled=\{item\.status !== "approved"/);
  assert.match(payableActions, /\.eq\("status", "approved"\)/);
});

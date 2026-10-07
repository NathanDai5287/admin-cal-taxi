import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("balance notes append safely, retain authors, and enforce administrator access", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = randomUUID();
  const otherAdmin = randomUUID();
  const member = randomUUID();
  const balance = randomUUID();
  const paidBalance = randomUUID();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('test.user_id', true), '')::uuid
    $$;
    create table public.profiles (id uuid primary key, full_name text, email text, role text);
    create function public.is_admin() returns boolean language sql security definer as $$
      select coalesce((select role = 'admin' from public.profiles where id=auth.uid()), false)
    $$;
    create table public.chapter_receivables (
      id uuid primary key, amount_assessed numeric(12,2) not null,
      amount_paid numeric(12,2) not null default 0, due_date date not null,
      notes text not null default '', waived_at timestamptz,
      payment_plan_frequency text, payment_plan_amount numeric(12,2),
      updated_at timestamptz not null default now()
    );
    create function public.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at=clock_timestamp(); return new; end;
    $$;
    create trigger balance_version before update on public.chapter_receivables
      for each row execute function public.set_updated_at();
  `);
  await db.query("insert into public.profiles values ($1,'Taylor Admin','admin@example.test','admin'),($2,'Jordan Admin','other@example.test','admin'),($3,'Member','member@example.test','member')", [admin, otherAdmin, member]);
  await db.query("insert into public.chapter_receivables (id,amount_assessed,amount_paid,due_date,notes,payment_plan_frequency,payment_plan_amount) values ($1,1000,250,'2026-10-01','Original charge reason','monthly',250),($2,1000,1000,'2026-10-01','Paid reason',null,null)", [balance, paidBalance]);
  await db.exec(await readFile(new URL("../supabase/migrations/20261009000000_dues_balance_notes.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261011000000_dues_balance_note_management.sql", import.meta.url), "utf8"));
  const signIn = (user) => db.query("select set_config('test.user_id',$1,false)", [user ?? ""]);
  const add = (id, body, request = randomUUID()) => db.query("select public.add_receivable_note($1,$2,$3) as id", [id, body, request]);
  const manage = (id, note, originalBody, operation, body = null) => db.query("select public.manage_receivable_note($1,$2,$3,$4,$5) as id", [id, note, originalBody, operation, body]);
  const original = (await db.query("select * from public.chapter_receivables order by id")).rows;
  await signIn(admin);
  const request = randomUUID();
  assert.equal((await add(balance, "  First note\nPayment arrangement confirmed.  ", request)).rows[0].id, request);
  await add(balance, "First note\nPayment arrangement confirmed.", request);
  assert.equal((await db.query("select count(*) from public.chapter_receivable_notes")).rows[0].count, 1);
  await assert.rejects(add(balance, "Different text", request), /already been used/);
  await assert.rejects(add(paidBalance, "First note\nPayment arrangement confirmed.", request), /already been used/);
  for (const body of [null, "", "   ", "x".repeat(2001)]) await assert.rejects(add(balance, body), /between 1 and 2000/);
  await add(balance, "x".repeat(2000));
  await assert.rejects(add(randomUUID(), "Missing balance"), /no longer available/);
  await assert.rejects(add(balance, "No request ID", null), /between 1 and 2000/);

  await signIn(otherAdmin);
  await assert.rejects(add(balance, "First note\nPayment arrangement confirmed.", request), /already been used/);
  await add(balance, "Second administrator's note");
  await add(paidBalance, "Notes are also available on paid balances");
  assert.deepEqual((await db.query("select * from public.chapter_receivables order by id")).rows, original);
  const first = (await db.query("select * from public.chapter_receivable_notes where id=$1", [request])).rows[0];
  assert.equal(first.created_by, admin);
  assert.equal(first.author_name, "Taylor Admin");
  assert.equal(first.body, "First note\nPayment arrangement confirmed.");
  assert.ok(first.created_at instanceof Date);

  await signIn(member);
  await assert.rejects(add(balance, "Unauthorized note"), /Administrator access required/);
  await assert.rejects(manage(balance, request, first.body, "edit", "Unauthorized edit"), /Administrator access required/);
  await assert.rejects(manage(balance, request, first.body, "delete"), /Administrator access required/);
  await db.exec("set role authenticated;");
  assert.equal((await db.query("select count(*) from public.chapter_receivable_notes")).rows[0].count, 0);
  await assert.rejects(db.query("insert into public.chapter_receivable_notes (receivable_id,body,author_name) values ($1,'Spoofed','Admin')", [balance]), /permission denied/);
  await db.exec("reset role;");
  await signIn(admin);
  await db.exec("set role authenticated;");
  assert.equal((await db.query("select count(*) from public.chapter_receivable_notes")).rows[0].count, 4);
  await add(balance, "Authenticated RPC note");
  await assert.rejects(db.query("delete from public.chapter_receivable_notes"), /permission denied/);
  await assert.rejects(db.query("update public.chapter_receivable_notes set body='Spoofed edit'"), /permission denied/);
  const disposable = randomUUID();
  await add(paidBalance, "Editable note", disposable);
  for (const body of [null, "", "   ", "x".repeat(2001)]) await assert.rejects(manage(paidBalance, disposable, "Editable note", "edit", body), /between 1 and 2000/);
  await assert.rejects(manage(paidBalance, disposable, "Editable note", "invalid"), /Choose edit or delete/);
  await assert.rejects(manage(balance, disposable, "Editable note", "delete"), /changed or was deleted/);
  await manage(paidBalance, disposable, "Editable note", "edit", "  Updated note  ");
  await assert.rejects(manage(paidBalance, disposable, "Editable note", "edit", "Stale edit"), /changed or was deleted/);
  await assert.rejects(manage(paidBalance, disposable, "Editable note", "delete"), /changed or was deleted/);
  await manage(paidBalance, disposable, "Updated note", "delete");
  assert.equal((await db.query("select count(*) from public.chapter_receivable_notes where id=$1", [disposable])).rows[0].count, 0);
  await assert.rejects(manage(paidBalance, disposable, "Updated note", "delete"), /changed or was deleted/);
  await db.exec("reset role;");
  assert.deepEqual((await db.query("select * from public.chapter_receivables order by id")).rows, original);
  await signIn(null);
  await assert.rejects(add(balance, "Signed-out note"), /Administrator access required/);
  await assert.rejects(manage(balance, request, first.body, "delete"), /Administrator access required/);
  const grants = (await db.query("select has_function_privilege('anon','public.add_receivable_note(uuid,text,uuid)','execute') as anon")).rows[0];
  assert.equal(grants.anon, false);
  assert.equal((await db.query("select has_function_privilege('anon','public.manage_receivable_note(uuid,uuid,text,text,text)','execute') as anon")).rows[0].anon, false);

  await signIn(otherAdmin);
  await manage(balance, request, first.body, "edit", "Edited by another administrator");
  const edited = (await db.query("select * from public.chapter_receivable_notes where id=$1", [request])).rows[0];
  assert.deepEqual(edited, { ...first, body: "Edited by another administrator" });
  await db.query("delete from public.profiles where id=$1", [admin]);
  const retained = (await db.query("select created_by,author_name,body from public.chapter_receivable_notes where id=$1", [request])).rows[0];
  assert.deepEqual(retained, { created_by: null, author_name: "Taylor Admin", body: edited.body });
  await db.query("update public.chapter_receivables set waived_at=now() where id=$1", [balance]);
  await assert.rejects(add(balance, "Note on waived balance"), /no longer available/);
  await assert.rejects(manage(balance, request, edited.body, "edit", "Waived edit"), /no longer available/);
  await assert.rejects(manage(balance, request, edited.body, "delete"), /no longer available/);
  assert.equal((await db.query("select count(*) from public.chapter_receivable_notes where receivable_id=$1", [balance])).rows[0].count, 4);
});

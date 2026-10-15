import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

async function setupDatabase(t) {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role', true) $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('client_id', current_setting('request.jwt.claim.client_id', true)) $$;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, extensions to authenticated, service_role;
    grant all on storage.objects to authenticated, service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    alter default privileges in schema public grant usage on sequences to authenticated, service_role;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const migration of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = (await readFile(new URL(migration, directory), "utf8")).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql).catch((error) => { throw new Error(`${migration}: ${error.message}`); });
  }
  return db;
}

async function signIn(db, id, clientId = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.client_id', $2, false), set_config('request.jwt.claim.role', 'authenticated', false)", [id, clientId]);
  await db.exec("set role authenticated");
}

async function person(db, role, membership = null, offices = []) {
  await db.exec("reset role");
  const id = randomUUID();
  await db.query("insert into profiles(id, email, full_name, role, membership, executive_roles) values ($1, $2, 'Test Person', $3, $4, $5)", [id, `${id}@example.test`, role, membership, offices]);
  return id;
}

const access = async (db, app, level = "read") => (await db.query("select public.has_app_access($1, $2) as allowed", [app, level])).rows[0].allowed;
const grant = (db, role, app, level) => db.query("select public.admin_set_role_app_access($1, $2, $3)", [role, app, level]);

test("role app grants enforce database, storage, RPC, and OAuth boundaries", async (t) => {
  const db = await setupDatabase(t);
  const admin = await person(db, "admin");
  const member = await person(db, "member", "brother", ["rush_chair"]);
  const associate = await person(db, "none", "associate_member");
  await signIn(db, admin);
  assert.equal((await db.query("select * from public.get_my_app_access()")).rows.length, 12);
  await assert.rejects(grant(db, "admin", "users", "none"), /cannot change/);
  await grant(db, "brother", "mailing-list", "read");
  await grant(db, "rush_chair", "mailing-list", "write");
  await grant(db, "exec_member", "finance", "read");
  await grant(db, "brother", "nu-news", "read");
  await db.query("insert into storage.objects(bucket_id, name) values ('nu-news', 'cover.jpg')");
  await db.query("insert into mailing_list_contacts(first_name, email) values ('Contact', 'contact@example.test')");
  await signIn(db, member);
  assert.equal(await access(db, "submit", "write"), true);
  assert.equal(await access(db, "mailing-list", "write"), true);
  assert.equal(await access(db, "finance"), true);
  assert.equal(await access(db, "finance", "write"), false);
  assert.equal(await access(db, "users"), false);
  assert.equal((await db.query("select * from storage.objects where bucket_id = 'nu-news'")).rows.length, 1);
  await assert.rejects(db.query("insert into storage.objects(bucket_id, name) values ('nu-news', 'blocked.jpg')"), /row-level security/);
  assert.equal((await db.query("update profiles set full_name = 'Blocked' where id = $1 returning id", [member])).rows.length, 0);
  await assert.rejects(grant(db, "brother", "roles", "write"), /Write access/);
  await assert.rejects(db.query("update profiles set role = 'admin' where id = $1", [member]), /permission denied/);
  await assert.rejects(db.query("select public.record_dues_payment($1, 10, current_date, gen_random_uuid())", [randomUUID()]), /Only admins|admin|access/i);
  assert.equal((await db.query("select * from mailing_list_contacts")).rows.length, 1);
  await db.query("update mailing_list_contacts set first_name = 'Edited'");
  await signIn(db, admin);
  await grant(db, "rush_chair", "mailing-list", "none");
  await signIn(db, member);
  assert.equal((await db.query("update mailing_list_contacts set first_name = 'Blocked' returning id")).rows.length, 0);
  await assert.rejects(db.query("insert into mailing_list_contacts(first_name,email) values ('Blocked','blocked@example.test')"), /row-level security/);
  await signIn(db, associate);
  assert.equal(await access(db, "submit"), false);
  assert.equal((await db.query("select * from mailing_list_contacts")).rows.length, 0);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${associate}/receipt.png`]), /row-level security/);
  await signIn(db, admin);
  await grant(db, "associate_member", "submit", "write");
  await grant(db, "associate_member", "users", "write");
  await signIn(db, associate);
  await db.query("select public.admin_invite_email('invited@example.test', 'member', null)");
  await assert.rejects(db.query("select public.admin_invite_email('promoted@example.test', 'admin', null)"), /only admins/);
  await assert.rejects(db.query("select public.admin_set_profile_role($1, 'member')", [admin]), /only admins/);
  await assert.rejects(db.query("select public.admin_remove_profile($1)", [admin]), /only admins/);
  await db.query("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${associate}/receipt.png`]);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${member}/receipt.png`]), /row-level security/);
  const submission = await db.query(`
    insert into public.reimbursements(user_id, full_name, category, amount, description, payment_method, receipt_path, status)
    values ($1, 'Test Person', 'house', 20, 'Chapter supplies', 'Check', $2, 'pending') returning id
  `, [associate, `${associate}/receipt.png`]);
  assert.equal(submission.rows.length, 1);
  await assert.rejects(db.query(`
    insert into public.reimbursements(user_id, full_name, category, amount, description, payment_method, receipt_path, status)
    values ($1, 'Other Person', 'house', 20, 'Chapter supplies', 'Check', $2, 'pending')
  `, [member, `${associate}/receipt.png`]), /row-level security/);
  await signIn(db, admin);
  await grant(db, "associate_member", "submit", "read");
  await signIn(db, associate);
  assert.equal((await db.query("select * from reimbursements")).rows.length, 1);
  assert.equal((await db.query("select * from storage.objects where bucket_id = 'receipts'")).rows.length, 1);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('receipts',$1)", [`${associate}/second.png`]), /row-level security/);
  await signIn(db, admin);
  await grant(db, "associate_member", "submit", "none");
  await grant(db, "associate_member", "users", "read");
  await signIn(db, associate);
  assert.equal((await db.query("select * from reimbursements")).rows.length, 0);
  assert.equal((await db.query("select * from storage.objects where bucket_id = 'receipts'")).rows.length, 0);
  await signIn(db, associate, "test-oauth-client");
  await db.query("select public.mcp_admin_read('members')");
  await assert.rejects(db.query("select public.mcp_admin_read('reimbursements')"), /OAuth grant/);
  await assert.rejects(db.query(`select public.mcp_begin_external('send_invite_email', '{"email":"invite@example.test","role":"member"}', gen_random_uuid(), true)`), /OAuth grant/);
  await signIn(db, member, "test-oauth-client");
  assert.equal(await access(db, "finance"), false);
  assert.equal((await db.query("select public.has_mcp_app_access('finance') as allowed")).rows[0].allowed, true);
  await db.query("select public.mcp_admin_read('reimbursements')");
  await assert.rejects(db.query("select public.mcp_admin_read('members')"), /OAuth grant/);
  await assert.rejects(db.query("select public.mcp_admin_write('set_opening_cash', '{\"amount\": 100}', null, true)"), /OAuth grant/);
  await signIn(db, admin);
  await grant(db, "exec_member", "finance", "write");
  const charge = (await db.query("insert into chapter_receivables(member_id, member_name, amount_assessed, due_date, created_by) values ($1, 'Test Person', 100, current_date, $2) returning id", [member, admin])).rows[0].id;
  await signIn(db, member);
  await db.query("select public.record_dues_payment($1, 10, current_date, gen_random_uuid())", [charge]);
  assert.equal(Number((await db.query("select amount_paid from chapter_receivables where id = $1", [charge])).rows[0].amount_paid), 10);
  await signIn(db, admin);
  await grant(db, "associate_member", "accreditation", "write");
  await signIn(db, associate);
  await assert.rejects(db.query("select public.approve_accreditation_revision($1, $2, $3)", [randomUUID(), randomUUID(), associate]), /report is not ready/);
  await signIn(db, admin);
  await grant(db, "associate_member", "policy", "write");
  await db.exec("reset role; set role service_role");
  await db.query("select public.reserve_policy_question($1, 'Test question', current_date, 5, 20)", [associate]);
  await signIn(db, admin);
  await grant(db, "associate_member", "policy", "read");
  await db.exec("reset role; set role service_role");
  await assert.rejects(db.query("select public.reserve_policy_question($1, 'Blocked question', current_date, 5, 20)", [associate]), /Member access required/);
  await signIn(db, admin);
  await db.query("select public.admin_remove_profile($1)", [member]);
  await signIn(db, member);
  assert.equal(await access(db, "submit"), false);
  await signIn(db, member, "test-oauth-client");
  await assert.rejects(db.query("select public.mcp_admin_read('reimbursements')"), /OAuth grant/);
});

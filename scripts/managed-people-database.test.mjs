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
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create type public.app_role as enum ('none', 'member', 'admin');
    create table public.profiles (
      id uuid primary key,
      full_name text not null default '',
      email text not null unique,
      role public.app_role not null default 'none',
      removed_at timestamptz,
      has_signed_in boolean not null default true
    );
    create table public.invites (email text primary key, role public.app_role not null);
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and removed_at is null)
    $$;
    insert into public.profiles (id, email, role)
      values ('00000000-0000-0000-0000-000000000001', 'admin@example.com', 'admin');
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261014140000_managed_people.sql", import.meta.url), "utf8"));
  await db.exec(`
    create trigger on_auth_user_created after insert on auth.users
      for each row execute procedure public.handle_new_user();
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
  `);
  return db;
}

async function addPerson(db, email = `${randomUUID()}@example.com`) {
  const id = randomUUID();
  await db.query("insert into public.profiles (id, email) values ($1, $2)", [id, email]);
  return id;
}

async function editPerson(db, id, membership = "brother", offices = []) {
  return db.query("select public.admin_update_person($1, $2, $3, $4, $5, $6)", [
    id, "Managed Name", "contact@example.com", "+1 202 555 0100", membership, offices,
  ]);
}

test("migration leaves membership unknown and management leaves app access and login unchanged", async (t) => {
  const db = await setupDatabase(t);
  assert.equal((await db.query("select membership from public.profiles")).rows[0].membership, null);
  const id = await addPerson(db, "login@example.com");
  await db.exec("set role authenticated");
  await editPerson(db, id, "brother", ["president", "treasurer"]);
  await db.exec("reset role");
  assert.deepEqual((await db.query("select email, contact_email, role, membership, executive_roles from public.profiles where id = $1", [id])).rows[0], {
    email: "login@example.com", contact_email: "contact@example.com", role: "none", membership: "brother", executive_roles: ["president", "treasurer"],
  });
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
  await assert.rejects(editPerson(db, id), /Only admins/);
  await assert.rejects(db.query("update public.profiles set membership = 'brother' where id = $1", [id]), /permission denied/);
});

test("only brothers hold valid offices and conflicting edits are atomic", async (t) => {
  const db = await setupDatabase(t);
  const first = await addPerson(db);
  const second = await addPerson(db);
  await editPerson(db, first, "brother", ["president"]);
  await assert.rejects(editPerson(db, second, "associate_member", ["rush_chair"]), /profiles_executive_membership/);
  await assert.rejects(editPerson(db, second, null, ["rush_chair"]), /profiles_executive_membership/);
  await assert.rejects(editPerson(db, second, "brother", ["unknown"]), /profiles_executive_roles/);
  await assert.rejects(editPerson(db, second, "brother", [null]), /profiles_executive_roles/);
  await assert.rejects(editPerson(db, second, "brother", ["president"]), /profiles_single_president/);
  assert.equal((await db.query("select full_name from public.profiles where id = $1", [second])).rows[0].full_name, "");
  await assert.rejects(editPerson(db, first, "associate_member", ["president"]), /profiles_executive_membership/);
  await editPerson(db, first, "brother", ["rush_chair"]);
  await editPerson(db, second, "brother", ["president", "rush_chair"]);
  await editPerson(db, first, "associate_member", []);
});

test("every single-holder office rejects duplicate assignments and archived holders release offices", async (t) => {
  const db = await setupDatabase(t);
  const first = await addPerson(db);
  const second = await addPerson(db);
  const offices = ["president", "vice_president", "treasurer", "house_manager", "social_chair", "education_chair", "secretary"];
  await editPerson(db, first, "brother", offices);
  for (const office of offices) {
    await assert.rejects(editPerson(db, second, "brother", [office]), /duplicate key/);
  }
  await db.query("update public.profiles set removed_at = now() where id = $1", [first]);
  await editPerson(db, second, "brother", offices);
  await db.query("update public.profiles set removed_at = null where id = $1", [first]);
  assert.deepEqual((await db.query("select executive_roles from public.profiles where id = $1", [first])).rows[0].executive_roles, []);
  assert.deepEqual((await db.query("select executive_roles from public.profiles where id = $1", [second])).rows[0].executive_roles, offices);
});

async function assertClaimPreservesPerson(db, pendingId, authId) {
  assert.equal((await db.query("select count(*)::int as count from public.profiles where id = $1", [pendingId])).rows[0].count, 0);
  const { rows } = await db.query("select full_name, contact_email, phone, membership, executive_roles, has_signed_in from public.profiles where id = $1", [authId]);
  assert.deepEqual(rows[0], {
    full_name: "Managed Name", contact_email: "contact@example.com", phone: "+1 202 555 0100",
    membership: "brother", executive_roles: ["president"], has_signed_in: true,
  });
}

test("first sign-in preserves managed contacts and offices when the identity changes", async (t) => {
  const db = await setupDatabase(t);
  const pendingId = await addPerson(db, "pending@example.com");
  await db.query("update public.profiles set has_signed_in = false where id = $1", [pendingId]);
  await editPerson(db, pendingId, "brother", ["president"]);
  const authId = randomUUID();
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'pending@example.com', '{\"full_name\":\"Provider Name\"}')", [authId]);
  await assertClaimPreservesPerson(db, pendingId, authId);
});

test("existing auth identity can claim a pending officer without losing managed details", async (t) => {
  const db = await setupDatabase(t);
  await db.exec("drop trigger on_auth_user_created on auth.users");
  const authId = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, 'pending@example.com')", [authId]);
  const pendingId = await addPerson(db, "pending@example.com");
  await db.query("update public.profiles set has_signed_in = false where id = $1", [pendingId]);
  await editPerson(db, pendingId, "brother", ["president"]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [authId]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select public.claim_pending_invite() as claimed")).rows[0].claimed, true);
  await db.exec("reset role");
  await assertClaimPreservesPerson(db, pendingId, authId);
});

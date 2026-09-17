import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("admins can name pending users and Google replaces that name on first sign-in", async (t) => {
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
      full_name text not null,
      email text not null,
      role public.app_role not null,
      removed_at timestamptz,
      has_signed_in boolean not null
    );
    create table public.invites (
      email text primary key,
      role public.app_role not null
    );
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'
    );
    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and removed_at is null
      )
    $$;
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/20260917010000_pending_profile_names.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);

  const adminId = randomUUID();
  const memberId = randomUUID();
  const pendingId = randomUUID();
  const googleId = randomUUID();
  await db.query(
    `insert into public.profiles (id, full_name, email, role, has_signed_in) values
      ($1, 'Admin', 'admin@example.com', 'admin', true),
      ($2, 'Signed Member', 'member@example.com', 'member', true),
      ($3, '', 'pending@example.com', 'member', false)`,
    [adminId, memberId, pendingId],
  );
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'pending@example.com', $2)",
    [googleId, { full_name: "Google Name" }],
  );

  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId]);
  await db.query("select public.admin_set_pending_profile_name($1, '  Manual Name  ')", [pendingId]);
  await assert.rejects(
    db.query("select public.admin_set_pending_profile_name($1, 'Changed')", [memberId]),
    /pending user not found/,
  );
  await assert.rejects(
    db.query("select public.admin_set_pending_profile_name($1, '   ')", [pendingId]),
    /between 1 and 120/,
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [memberId]);
  await assert.rejects(
    db.query("select public.admin_set_pending_profile_name($1, 'Member Change')", [pendingId]),
    /only admins/,
  );

  await db.exec("reset role");
  assert.equal(
    (await db.query("select full_name from public.profiles where id = $1", [pendingId])).rows[0].full_name,
    "Manual Name",
  );

  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [googleId]);
  assert.equal((await db.query("select public.claim_pending_invite() as claimed")).rows[0].claimed, true);
  await db.exec("reset role");
  assert.deepEqual(
    (await db.query("select id, full_name, has_signed_in from public.profiles where email = 'pending@example.com'")).rows,
    [{ id: googleId, full_name: "Google Name", has_signed_in: true }],
  );
});

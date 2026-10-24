import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role authenticator;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create type public.profile_role as enum ('none', 'member', 'admin');
    create table public.profiles (id uuid primary key, role public.profile_role, membership text, executive_roles text[] not null default '{}', removed_at timestamptz);
    insert into public.profiles values
      ('00000000-0000-0000-0000-000000000001', 'admin', 'brother', '{}', null),
      ('00000000-0000-0000-0000-000000000002', 'member', 'brother', '{}', null);
  `);
  const roles = await migration("20261014150000_role_app_access.sql");
  await db.exec(roles.slice(0, roles.indexOf("create function public.get_my_app_access")));
  await db.exec(`
    update public.role_app_access set access_level = 'read' where role_key = 'brother' and app_key = 'finance';
    update public.role_app_access set access_level = 'write' where role_key = 'treasurer' and app_key = 'finance';
    update public.role_app_access set access_level = 'read' where role_key = 'exec_member' and app_key = 'rush';
  `);
  await db.exec(await migration("20261023010000_view_as_read_only.sql"));
  return db;
}

async function as(db, uid, viewAs) {
  await db.query("select set_config('test.uid', $1, false)", [uid]);
  await db.query("select set_config('request.headers', $1, false)", [viewAs ? JSON.stringify({ "x-view-as-role": viewAs }) : ""]);
}

async function access(db) {
  const { rows } = await db.query("select app_key, access_level from public.get_my_app_access() where access_level <> 'none' order by app_key");
  return Object.fromEntries(rows.map(row => [row.app_key, row.access_level]));
}

const ADMIN = "00000000-0000-0000-0000-000000000001";
const BROTHER = "00000000-0000-0000-0000-000000000002";

test("an administrator who views as a role gets only that role and its parents", async (t) => {
  const db = await setup();
  t.after(() => db.close());
  await as(db, ADMIN);
  assert.equal((await db.query("select public.is_admin() as admin")).rows[0].admin, true);
  await as(db, ADMIN, "treasurer");
  assert.equal((await db.query("select public.is_admin() as admin")).rows[0].admin, false);
  assert.deepEqual(await access(db), { finance: "write", rush: "read", submit: "write" });
  await as(db, ADMIN, "associate_member");
  assert.deepEqual(await access(db), { submit: "write" });
  await as(db, ADMIN, "admin");
  assert.deepEqual(await access(db), {});
});

test("a member cannot gain access by sending a view as role", async (t) => {
  const db = await setup();
  t.after(() => db.close());
  await as(db, BROTHER, "treasurer");
  assert.deepEqual(await access(db), { finance: "read", submit: "write" });
});

test("any request that views as a role cannot write", async (t) => {
  const db = await setup();
  t.after(() => db.close());
  await as(db, ADMIN, "treasurer");
  await db.exec("begin");
  await db.query("select public.block_view_as_writes()");
  await assert.rejects(db.query("update public.role_app_access set access_level = 'none' where role_key = 'member'"), /read-only transaction/);
  await db.exec("rollback");
  await as(db, ADMIN);
  await db.exec("begin");
  await db.query("select public.block_view_as_writes()");
  await db.query("update public.role_app_access set access_level = 'read' where role_key = 'member' and app_key = 'rush'");
  await db.exec("rollback");
});

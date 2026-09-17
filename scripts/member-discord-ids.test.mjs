import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("admins manage one Discord ID per member and existing balances stay synchronized", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles (
      id uuid primary key,
      full_name text not null,
      email text not null,
      role text not null,
      removed_at timestamptz
    );
    create table public.chapter_receivables (
      id uuid primary key,
      member_id uuid references public.profiles(id),
      discord_user_id text not null default '',
      updated_at timestamptz not null default now()
    );
    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and removed_at is null
      )
    $$;
  `);

  const adminId = randomUUID();
  const memberId = randomUUID();
  const otherId = randomUUID();
  await db.query(
    `insert into public.profiles (id, full_name, email, role) values
      ($1, 'Admin', 'admin@example.com', 'admin'),
      ($2, 'Member', 'member@example.com', 'member'),
      ($3, 'Other', 'other@example.com', 'member')`,
    [adminId, memberId, otherId],
  );
  await db.query(
    `insert into public.chapter_receivables (id, member_id, discord_user_id, updated_at) values
      ($1, $2, '111111111111111', '2026-01-01'),
      ($3, $2, '222222222222222', '2026-02-01')`,
    [randomUUID(), memberId, randomUUID()],
  );

  const migration = await readFile(
    new URL("../supabase/migrations/20260919000000_member_discord_ids.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);

  assert.equal(
    (await db.query("select discord_user_id from public.profiles where id = $1", [memberId])).rows[0].discord_user_id,
    "222222222222222",
  );

  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId]);
  await db.query("select public.admin_set_profile_discord_id($1, '333333333333333')", [memberId]);
  await db.exec("reset role");
  assert.deepEqual(
    (await db.query("select distinct discord_user_id from public.chapter_receivables where member_id = $1", [memberId])).rows,
    [{ discord_user_id: "333333333333333" }],
  );
  await assert.rejects(
    db.query("select public.admin_set_profile_discord_id($1, 'not-an-id')", [memberId]),
    /15 to 22 digits/,
  );
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [otherId]);
  await assert.rejects(
    db.query("select public.admin_set_profile_discord_id($1, '')", [memberId]),
    /only admins/,
  );
});

test("fee controls no longer contain Discord ID fields", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/(admin)/finance/accounts/receivable/bulk-fee-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/finance/accounts/receivable/dues-ledger.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of files) {
    assert.doesNotMatch(source, /name=["{`]discordUserId/);
    assert.doesNotMatch(source, /Discord member ID/);
  }
});

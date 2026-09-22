import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("one academic calendar connects accreditation, finance, and members", async () => {
  const [migration, accreditation, finance, members, memberActions] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261001000000_sitewide_academic_calendar.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/accreditation/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/finance/planning/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/users/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/users/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /rename to academic_years/);
  assert.match(migration, /rename to academic_terms/);
  assert.match(migration, /chapter_financial_settings[\s\S]*academic_term_id/);
  assert.match(migration, /profiles[\s\S]*member_since_term_id/);
  assert.match(accreditation, /from\("academic_years"\)/);
  assert.match(finance, /academic_terms\(label, starts_on, ends_on\)/);
  assert.match(members, /from\("academic_terms"\)/);
  assert.match(memberActions, /admin_set_profile_academic_term/);
});

test("members can set or clear a join term and invitations can assign one", async () => {
  const [table, actions, migration] = await Promise.all([
    readFile(new URL("../app/(admin)/users/members-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(admin)/users/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261001000000_sitewide_academic_calendar.sql", import.meta.url), "utf8"),
  ]);

  assert.match(table, /<th>Member since<\/th>/);
  assert.match(table, /<option value="">Not set<\/option>/);
  assert.match(actions, /invite_member_since_term_id: memberSinceTermId/);
  assert.match(migration, /set member_since_term_id = new_academic_term_id/);
});

test("calendar migration preserves data and backfills Finance", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const migration = await readFile(new URL("../supabase/migrations/20261001000000_sitewide_academic_calendar.sql", import.meta.url), "utf8");

  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create type public.app_role as enum ('none', 'member', 'admin');
    create table public.profiles (
      id uuid primary key default gen_random_uuid(), full_name text not null default '', email text not null default '',
      role public.app_role not null default 'member', removed_at timestamptz, has_signed_in boolean not null default true
    );
    create function public.is_admin() returns boolean language sql stable as $$ select true $$;
    create table public.accreditation_cycles (
      id uuid primary key default gen_random_uuid(), label text not null unique, starts_on date not null, ends_on date not null,
      created_by uuid references public.profiles(id), created_at timestamptz not null default now()
    );
    create table public.accreditation_terms (
      id uuid primary key default gen_random_uuid(), cycle_id uuid not null references public.accreditation_cycles(id) on delete cascade,
      season text not null check (season in ('fall', 'spring')), label text not null, starts_on date not null, ends_on date not null,
      created_at timestamptz not null default now(), unique (cycle_id, season), unique (id, cycle_id)
    );
    create table public.chapter_financial_settings (
      id boolean primary key default true, chapter_name text not null default 'Theta Xi', term_label text not null,
      term_start date not null, term_end date not null, opening_cash numeric not null default 0,
      updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
    );
    create table public.invites (
      email text primary key, role public.app_role not null, invited_by uuid references public.profiles(id), created_at timestamptz not null default now()
    );
    create function public.admin_invite_email(invite_email text, invite_role public.app_role)
    returns void language sql as $$ select $$;
    insert into public.chapter_financial_settings (id, term_label, term_start, term_end)
    values (true, 'Fall 2026', '2026-08-01', '2026-12-31');
  `);

  await db.exec(migration);
  const finance = await db.query(`
    select settings.academic_term_id, term.label
    from public.chapter_financial_settings settings
    join public.academic_terms term on term.id = settings.academic_term_id
    where settings.id = true
  `);
  const columns = await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'member_since_term_id'
  `);

  assert.equal(finance.rows[0].label, "Fall 2026");
  assert.ok(finance.rows[0].academic_term_id);
  assert.equal(columns.rows.length, 1);
  await db.close();
});

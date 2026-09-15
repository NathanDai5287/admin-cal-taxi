#!/usr/bin/env bash
# Runs only in a new, disposable PostgreSQL cluster; never touches configured app databases.
set -euo pipefail
finance_repo_dir=$(cd "$(dirname "$0")/.." && pwd)
finance_pg_bin=$(pg_config --bindir)
finance_pg_tmp=$(mktemp -d /tmp/finance-boundaries.XXXXXX)
cleanup() {
  "$finance_pg_bin/pg_ctl" -D "$finance_pg_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$finance_pg_tmp"
}
trap cleanup EXIT
"$finance_pg_bin/initdb" -D "$finance_pg_tmp/data" -A trust --no-locale >/dev/null
"$finance_pg_bin/pg_ctl" -D "$finance_pg_tmp/data" -l "$finance_pg_tmp/server.log" -o "-k $finance_pg_tmp -h '' -p 55439" start >/dev/null
finance_psql=("$finance_pg_bin/psql" -X -h "$finance_pg_tmp" -p 55439 -d postgres -v ON_ERROR_STOP=1 -q)
"${finance_psql[@]}" <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
grant usage on schema auth to authenticated;
create table public.profiles (id uuid primary key, full_name text not null, role text not null, removed_at timestamptz);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and removed_at is null);
$$;
create table public.chapter_receivables (id int primary key, member_name text not null, amount_assessed numeric, amount_paid numeric default 0);
create table public.reimbursements (id int primary key, status text not null default 'pending', reimbursed boolean not null default false);
create table public.reimbursement_budget_entries (id int primary key, amount numeric);
create table public.reimbursement_manual_expenses (id int primary key, amount numeric, created_by uuid);
insert into public.chapter_receivables values (1, 'Historical member', 100, 20);
insert into public.reimbursement_budget_entries values (1, 100);
SQL
"${finance_psql[@]}" -f "$finance_repo_dir/supabase/migrations/20260914000000_finance_boundaries.sql"
# Exercise the real, existing manual-transaction RLS policies as well.
sed -n '/^revoke all on public.reimbursement_manual_expenses/,$p' "$finance_repo_dir/supabase/migrations/20260905040000_manual_expenses_and_new_categories.sql" | "${finance_psql[@]}"
"${finance_psql[@]}" -f "$finance_repo_dir/scripts/finance-boundaries.test.sql"

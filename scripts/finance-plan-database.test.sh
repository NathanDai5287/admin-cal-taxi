#!/usr/bin/env bash
set -euo pipefail
finance_repo_dir=$(cd "$(dirname "$0")/.." && pwd)
finance_pg_bin=$(pg_config --bindir)
finance_pg_tmp=$(mktemp -d /tmp/finance-plan.XXXXXX)
cleanup() {
  "$finance_pg_bin/pg_ctl" -D "$finance_pg_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$finance_pg_tmp"
}
trap cleanup EXIT
"$finance_pg_bin/initdb" -D "$finance_pg_tmp/data" -A trust --no-locale >/dev/null
"$finance_pg_bin/pg_ctl" -D "$finance_pg_tmp/data" -l "$finance_pg_tmp/server.log" -o "-k $finance_pg_tmp -h '' -p 55440" start >/dev/null
finance_psql=("$finance_pg_bin/psql" -X -h "$finance_pg_tmp" -p 55440 -d postgres -v ON_ERROR_STOP=1 -q)
"${finance_psql[@]}" <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
create table public.profiles (id uuid primary key, role text not null);
create table public.chapter_receivables (
  id uuid primary key,
  amount_assessed numeric not null,
  amount_paid numeric not null default 0,
  due_date date not null,
  updated_at timestamptz not null default now()
);
create table public.dues_payment_requests (
  request_id uuid primary key,
  receivable_id uuid not null references public.chapter_receivables(id),
  created_at timestamptz not null default now()
);
create table public.reimbursements (
  id uuid primary key,
  amount numeric not null,
  status text not null,
  reimbursed boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.chapter_financial_settings (id boolean primary key, opening_cash numeric not null default 0);
create table public.reimbursement_budget_entries (id uuid primary key, amount numeric not null, kind text not null);
create table public.reimbursement_manual_expenses (id uuid primary key, amount numeric not null);
create table public.mcp_audit_log (user_id uuid, client_id text, tool_name text);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create function public.is_mcp_admin() returns boolean language sql stable as $$select public.is_admin()$$;
create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at = now(); return new; end$$;
insert into public.profiles values ('00000000-0000-0000-0000-000000000001', 'admin');
insert into public.chapter_receivables values (
  '00000000-0000-0000-0000-000000000010', 600, 100, '2026-08-15', '2026-09-01T12:00:00Z'
);
insert into public.reimbursements values (
  '00000000-0000-0000-0000-000000000020', 75, 'approved', true, '2026-09-02T12:00:00Z'
);
SQL
"${finance_psql[@]}" -f "$finance_repo_dir/supabase/migrations/20260922000000_finance_plan_actual.sql"
"${finance_psql[@]}" -f "$finance_repo_dir/supabase/migrations/20260923000000_hosting_ledger_immutable.sql"
"${finance_psql[@]}" <<'SQL'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.record_dues_payment(
  '00000000-0000-0000-0000-000000000010', 50, '2027-01-03', '00000000-0000-0000-0000-000000000201'
);
select public.record_dues_payment(
  '00000000-0000-0000-0000-000000000010', 50, '2027-01-03', '00000000-0000-0000-0000-000000000201'
);
update public.chapter_receivables
set amount_paid = amount_assessed
where id = '00000000-0000-0000-0000-000000000010';
do $$
declare
  payment_total numeric;
begin
  select sum(amount) into payment_total from public.chapter_dues_payment_events;
  begin
    update public.chapter_receivables
    set amount_assessed = 700, amount_paid = 700
    where id = '00000000-0000-0000-0000-000000000010';
    raise exception 'paid charge amount edit was accepted';
  exception when sqlstate '22023' then
    null;
  end;
  if (select sum(amount) from public.chapter_dues_payment_events) <> payment_total then
    raise exception 'paid charge amount edit changed actual income';
  end if;
end
$$;
insert into public.hosting_finance_orders (
  order_id, organization, event_date, planned_revenue, planned_fire_permit, confirmed_by
) values (
  'order-1', 'Example group', '2026-10-01', 2000, 125, '00000000-0000-0000-0000-000000000001'
);
do $$
begin
  begin
    insert into public.hosting_finance_orders (
      order_id, organization, event_date, planned_revenue, planned_fire_permit, confirmed_by
    ) values (
      'order-1', 'Duplicate group', '2026-10-02', 3000, 0, '00000000-0000-0000-0000-000000000001'
    );
    raise exception 'duplicate hosting confirmation was accepted';
  exception when unique_violation then
    null;
  end;
end
$$;
-- Terms of a confirmed contract are immutable.
do $$
begin
  begin
    update public.hosting_finance_orders
    set planned_revenue = 2500
    where order_id = 'order-1';
    raise exception 'confirmed contract term edit was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;
select public.record_hosting_payment(
  'order-1', 'revenue', 500, '2026-10-03', '00000000-0000-0000-0000-000000000101'
);
do $$
begin
  begin
    perform public.record_hosting_payment(
      'order-1', 'revenue', 400, '2026-10-03', '00000000-0000-0000-0000-000000000101'
    );
    raise exception 'changed idempotent payment was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;
select public.record_hosting_payment(
  'order-1', 'revenue', 500, '2026-10-03', '00000000-0000-0000-0000-000000000101'
);
do $$
begin
  begin
    perform public.record_hosting_payment(
      'order-1', 'revenue', 1600, '2026-10-03', '00000000-0000-0000-0000-000000000102'
    );
    raise exception 'hosting overpayment was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;
update public.hosting_finance_orders
set status = 'cancelled', cancelled_at = now()
where order_id = 'order-1';
do $$
begin
  begin
    perform public.record_hosting_payment(
      'order-1', 'revenue', 100, '2026-10-04', '00000000-0000-0000-0000-000000000103'
    );
    raise exception 'cancelled hosting payment was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;
-- Re-confirmation (cancelled → confirmed) may refresh terms from the order.
update public.hosting_finance_orders
set status = 'confirmed', cancelled_at = null, planned_revenue = 2200
where order_id = 'order-1';
do $$
begin
  if (select planned_revenue from public.hosting_finance_orders where order_id = 'order-1') <> 2200 then
    raise exception 're-confirmation did not refresh terms';
  end if;
end
$$;
-- Recorded payments are immutable; only the reversal columns may change.
do $$
begin
  begin
    update public.hosting_finance_payments set amount = 1 where kind = 'revenue';
    raise exception 'payment amount edit was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;
update public.hosting_finance_payments
set reversed_at = now(), reversal_reason = 'test reversal'
where kind = 'revenue';
-- Restore the fixture state the final assertions expect.
update public.hosting_finance_payments
set reversed_at = null, reversal_reason = null
where kind = 'revenue';
update public.hosting_finance_orders
set status = 'cancelled', cancelled_at = now()
where order_id = 'order-1';
delete from public.chapter_receivables
where id = '00000000-0000-0000-0000-000000000010';
do $$
begin
  if (select count(*) from public.hosting_finance_orders where status = 'confirmed') <> 0 then
    raise exception 'cancelled hosting order still contributes to the plan';
  end if;
  if (select sum(amount) from public.hosting_finance_payments where kind = 'revenue') <> 500 then
    raise exception 'idempotent hosting payment failed';
  end if;
  if (select sum(amount) from public.chapter_dues_payment_events) <> 600 then
    raise exception 'legacy dues backfill lost money';
  end if;
  if (select count(*) from public.chapter_dues_payment_events where paid_date = '2027-01-03') <> 1 then
    raise exception 'dated dues payment was not idempotent';
  end if;
  if (select count(*) from public.chapter_dues_payment_events where date_is_estimated) <> 1 then
    raise exception 'legacy dues dates were not marked estimated';
  end if;
  if not (select reimbursement_date_is_estimated from public.reimbursements limit 1) then
    raise exception 'legacy reimbursement date was not marked estimated';
  end if;
  if not exists (
    select 1 from public.chapter_receivables
    where id = '00000000-0000-0000-0000-000000000010' and waived_at is not null
  ) then
    raise exception 'dues history was deleted instead of waived';
  end if;
end
$$;
SQL
echo "Finance plan database checks passed"

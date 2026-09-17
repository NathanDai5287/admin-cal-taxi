create table if not exists public.mcp_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  tool_name text not null check (tool_name in (
    'get_finance_overview',
    'list_budget_categories',
    'list_open_dues'
  )),
  called_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') = '' and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and removed_at is null
  )
$$;

create function public.is_mcp_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> '' and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and removed_at is null
  )
$$;

create index if not exists mcp_audit_log_user_called_at_idx
  on public.mcp_audit_log (user_id, called_at desc);

revoke all on public.mcp_audit_log from anon, authenticated;
grant select on public.mcp_audit_log to authenticated;
alter table public.mcp_audit_log enable row level security;

drop policy if exists "admins can view their MCP audit records" on public.mcp_audit_log;
create policy "admins can view their MCP audit records"
  on public.mcp_audit_log for select to authenticated
  using (user_id = auth.uid() and (public.is_admin() or public.is_mcp_admin()));

create or replace function public.mcp_finance_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required';
  end if;

  select jsonb_build_object(
    'currency', 'USD',
    'openingCash', coalesce((select opening_cash from public.chapter_financial_settings where id), 0),
    'recordedIncome', coalesce((select sum(amount) from public.reimbursement_budget_entries where kind = 'income'), 0),
    'approvedSpending',
      coalesce((select sum(amount) from public.reimbursements where status = 'approved'), 0)
      + coalesce((select sum(amount) from public.reimbursement_manual_expenses), 0),
    'cashPosition',
      coalesce((select opening_cash from public.chapter_financial_settings where id), 0)
      + coalesce((select sum(amount) from public.reimbursement_budget_entries where kind = 'income'), 0)
      - coalesce((select sum(amount) from public.reimbursements where status = 'approved' and reimbursed), 0)
      - coalesce((select sum(amount) from public.reimbursement_manual_expenses), 0),
    'accountsReceivable', coalesce((
      select sum(greatest(0, amount_assessed - amount_paid)) from public.chapter_receivables
    ), 0),
    'reimbursementsToPay', coalesce((
      select sum(amount) from public.reimbursements where status = 'approved' and not reimbursed
    ), 0)
  ) into result;

  insert into public.mcp_audit_log (user_id, client_id, tool_name)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'get_finance_overview');
  return result;
end;
$$;

create or replace function public.mcp_budget_categories()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required';
  end if;

  with spending as (
    select category::text as category, sum(amount) as spent
    from public.reimbursements
    where status = 'approved'
    group by category
    union all
    select category::text, sum(amount)
    from public.reimbursement_manual_expenses
    group by category
  ), totals as (
    select category, sum(spent) as spent
    from spending
    group by category
  ), categories as (
    select budget_key as category from public.reimbursement_budgets
    union
    select category from totals
  )
  select jsonb_build_object(
    'currency', 'USD',
    'categories', coalesce(jsonb_agg(jsonb_build_object(
      'category', categories.category,
      'budget', budgets.amount,
      'spent', coalesce(totals.spent, 0),
      'remaining', case when budgets.amount is null then null else budgets.amount - coalesce(totals.spent, 0) end
    ) order by categories.category), '[]'::jsonb)
  )
  into result
  from categories
  left join public.reimbursement_budgets budgets on budgets.budget_key = categories.category
  left join totals on totals.category = categories.category;

  insert into public.mcp_audit_log (user_id, client_id, tool_name)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'list_budget_categories');
  return result;
end;
$$;

create or replace function public.mcp_open_dues()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required';
  end if;

  select jsonb_build_object(
    'currency', 'USD',
    'balances', coalesce(jsonb_agg(jsonb_build_object(
      'memberName', member_name,
      'amountAssessed', amount_assessed,
      'amountPaid', amount_paid,
      'outstanding', amount_assessed - amount_paid,
      'dueDate', due_date
    ) order by due_date, member_name) filter (where amount_assessed > amount_paid), '[]'::jsonb)
  ) into result
  from public.chapter_receivables;

  insert into public.mcp_audit_log (user_id, client_id, tool_name)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'list_open_dues');
  return result;
end;
$$;

revoke all on function public.is_mcp_admin() from public, anon, authenticated;
revoke all on function public.mcp_finance_overview() from public, anon, authenticated;
revoke all on function public.mcp_budget_categories() from public, anon, authenticated;
revoke all on function public.mcp_open_dues() from public, anon, authenticated;
grant execute on function public.mcp_finance_overview() to authenticated;
grant execute on function public.mcp_budget_categories() to authenticated;
grant execute on function public.mcp_open_dues() to authenticated;
grant execute on function public.is_mcp_admin() to authenticated;

drop function if exists public.mcp_budget_categories();

alter table public.reimbursement_budgets
  drop constraint if exists reimbursement_budgets_pkey,
  drop constraint if exists reimbursement_budgets_budget_key_check;

alter table public.reimbursement_budgets
  add column id boolean,
  add column category_amounts jsonb;

with category_keys as (
  select category::text as category
  from unnest(enum_range(null::public.reimbursement_category)) as category
), legacy_budgets as (
  select budget_key, amount
  from public.reimbursement_budgets
  where budget_key <> 'overall'
)
insert into public.reimbursement_budgets (budget_key, amount, id, category_amounts, updated_by, updated_at)
select
  '__category_map__',
  null,
  true,
  jsonb_object_agg(
    category_keys.category,
    case when legacy_budgets.amount is null then 'null'::jsonb else to_jsonb(legacy_budgets.amount) end
  ),
  (select updated_by from public.reimbursement_budgets order by updated_at desc limit 1),
  coalesce((select max(updated_at) from public.reimbursement_budgets), now())
from category_keys
left join legacy_budgets on legacy_budgets.budget_key = category_keys.category;

delete from public.reimbursement_budgets where id is null;

create or replace function public.valid_reimbursement_budget_map(budgets jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  budget record;
  amount numeric;
begin
  if jsonb_typeof(budgets) <> 'object' then return false; end if;

  for budget in select key, value from jsonb_each(budgets) loop
    if not exists (
      select 1
      from unnest(enum_range(null::public.reimbursement_category)) as category
      where category::text = budget.key
    ) then return false; end if;
    if budget.value = 'null'::jsonb then continue; end if;
    if jsonb_typeof(budget.value) <> 'number' then return false; end if;
    amount := (budget.value #>> '{}')::numeric;
    if amount < 0 or amount > 999999999.99 or amount <> round(amount, 2) then return false; end if;
  end loop;

  return true;
end;
$$;

alter table public.reimbursement_budgets
  alter column id set not null,
  alter column id set default true,
  alter column category_amounts set not null,
  alter column category_amounts set default '{}'::jsonb,
  add primary key (id),
  add constraint reimbursement_budgets_singleton_check check (id),
  add constraint reimbursement_budget_values_check check (public.valid_reimbursement_budget_map(category_amounts)),
  drop column budget_key,
  drop column amount;

drop policy if exists "admins can create reimbursement budgets" on public.reimbursement_budgets;
drop policy if exists "admins can update reimbursement budgets" on public.reimbursement_budgets;

create policy "admins can create reimbursement budgets"
  on public.reimbursement_budgets for insert to authenticated
  with check (public.is_admin() and id and updated_by = auth.uid());

create policy "admins can update reimbursement budgets"
  on public.reimbursement_budgets for update to authenticated
  using (public.is_admin() and id)
  with check (public.is_admin() and id and updated_by = auth.uid());

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
    select category::text as category, sum(amount) as spent from public.reimbursements
    where status = 'approved' group by category
    union all
    select category::text, sum(amount) from public.reimbursement_manual_expenses group by category
  ), totals as (
    select category, sum(spent) as spent from spending group by category
  ), budget_values as (
    select key as category, value as budget
    from public.reimbursement_budgets, jsonb_each(category_amounts)
    where id
  ), category_keys as (
    select category::text as category
    from unnest(enum_range(null::public.reimbursement_category)) as category
  )
  select jsonb_build_object(
    'currency', 'USD',
    'categories', coalesce(jsonb_agg(jsonb_build_object(
      'category', category_keys.category,
      'budget', case when budget_values.budget = 'null'::jsonb then null else (budget_values.budget #>> '{}')::numeric end,
      'spent', coalesce(totals.spent, 0),
      'remaining', case
        when budget_values.budget is null or budget_values.budget = 'null'::jsonb then null
        else (budget_values.budget #>> '{}')::numeric - coalesce(totals.spent, 0)
      end
    ) order by category_keys.category), '[]'::jsonb)
  ) into result
  from category_keys
  left join budget_values using (category)
  left join totals using (category);

  insert into public.mcp_audit_log (user_id, client_id, tool_name)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'list_budget_categories');
  return result;
end;
$$;

revoke all on function public.mcp_budget_categories() from public, anon, authenticated;
grant execute on function public.mcp_budget_categories() to authenticated;

alter table public.reimbursement_budgets
  add column original_category_amounts jsonb not null default '{}'::jsonb,
  add column completed_categories public.reimbursement_category[] not null default '{}',
  add constraint reimbursement_original_budget_values_check
    check (public.valid_reimbursement_budget_map(original_category_amounts));

update public.reimbursement_budgets
set original_category_amounts = category_amounts;

create function public.preserve_original_expense_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  category_budget record;
begin
  new.original_category_amounts := case when tg_op = 'UPDATE'
    then old.original_category_amounts else '{}'::jsonb end;

  for category_budget in select key, value from jsonb_each(new.category_amounts) loop
    if category_budget.value = 'null'::jsonb then continue; end if;
    if new.original_category_amounts -> category_budget.key is not null
      and new.original_category_amounts -> category_budget.key <> 'null'::jsonb then continue; end if;
    new.original_category_amounts := new.original_category_amounts
      || jsonb_build_object(category_budget.key, category_budget.value);
  end loop;

  return new;
end;
$$;

create trigger reimbursement_budgets_preserve_original
  before insert or update on public.reimbursement_budgets
  for each row execute function public.preserve_original_expense_plan();

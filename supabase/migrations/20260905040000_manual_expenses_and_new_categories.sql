-- Replace the old reimbursement categories while preserving historical rows
-- under the closest new reporting category.
create type public.reimbursement_category_v2 as enum (
  'administration',
  'rush',
  'socials',
  'education',
  'philanthropy',
  'brother_bonding',
  'retreat'
);

alter table public.reimbursements
  alter column category type public.reimbursement_category_v2
  using (
    case category::text
      when 'food' then 'socials'
      when 'events' then 'socials'
      when 'travel' then 'retreat'
      else 'administration'
    end
  )::public.reimbursement_category_v2;

drop type public.reimbursement_category;
alter type public.reimbursement_category_v2 rename to reimbursement_category;

-- Category limits from the old taxonomy cannot be mapped reliably. Keep the
-- overall limit and let administrators set limits for the new categories.
alter table public.reimbursement_budgets
  drop constraint if exists reimbursement_budgets_budget_key_check;

delete from public.reimbursement_budgets where budget_key <> 'overall';

alter table public.reimbursement_budgets
  add constraint reimbursement_budgets_budget_key_check check (
    budget_key in (
      'overall',
      'administration',
      'rush',
      'socials',
      'education',
      'philanthropy',
      'brother_bonding',
      'retreat'
    )
  );

create table public.reimbursement_manual_expenses (
  id uuid primary key default gen_random_uuid(),
  category public.reimbursement_category not null,
  amount numeric(12, 2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 500),
  expense_date date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reimbursement_manual_expenses_date_idx
  on public.reimbursement_manual_expenses (expense_date desc);
create index reimbursement_manual_expenses_category_date_idx
  on public.reimbursement_manual_expenses (category, expense_date desc);

create trigger reimbursement_manual_expenses_set_updated_at
  before update on public.reimbursement_manual_expenses
  for each row execute procedure public.set_updated_at();

revoke all on public.reimbursement_manual_expenses from anon, authenticated;
grant select, insert, update, delete on public.reimbursement_manual_expenses to authenticated;

alter table public.reimbursement_manual_expenses enable row level security;

create policy "admins can view manual reimbursement expenses"
  on public.reimbursement_manual_expenses for select to authenticated
  using (public.is_admin());

create policy "admins can create manual reimbursement expenses"
  on public.reimbursement_manual_expenses for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy "admins can update manual reimbursement expenses"
  on public.reimbursement_manual_expenses for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete manual reimbursement expenses"
  on public.reimbursement_manual_expenses for delete to authenticated
  using (public.is_admin());

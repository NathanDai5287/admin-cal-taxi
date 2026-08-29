create table public.reimbursement_budgets (
  budget_key text primary key check (
    budget_key in ('overall', 'food', 'supplies', 'travel', 'events', 'utilities', 'other')
  ),
  amount numeric(12, 2) check (amount is null or amount >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger reimbursement_budgets_set_updated_at
  before update on public.reimbursement_budgets
  for each row execute procedure public.set_updated_at();

revoke all on public.reimbursement_budgets from anon, authenticated;
grant select, insert, update on public.reimbursement_budgets to authenticated;

alter table public.reimbursement_budgets enable row level security;

create policy "admins can view reimbursement budgets"
  on public.reimbursement_budgets for select to authenticated
  using (public.is_admin());

create policy "admins can create reimbursement budgets"
  on public.reimbursement_budgets for insert to authenticated
  with check (public.is_admin() and updated_by = auth.uid());

create policy "admins can update reimbursement budgets"
  on public.reimbursement_budgets for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());

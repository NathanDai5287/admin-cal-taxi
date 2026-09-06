create table public.reimbursement_budget_entries (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 500),
  budget_date date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reimbursement_budget_entries_date_idx
  on public.reimbursement_budget_entries (budget_date desc, created_at desc);

create trigger reimbursement_budget_entries_set_updated_at
  before update on public.reimbursement_budget_entries
  for each row execute procedure public.set_updated_at();

-- Preserve the prior overall budget as the first funding-history entry. From
-- this point forward, the total budget is the sum of this ledger.
insert into public.reimbursement_budget_entries (
  amount,
  description,
  budget_date,
  created_by,
  created_at,
  updated_at
)
select
  amount,
  'Starting budget',
  updated_at::date,
  updated_by,
  updated_at,
  updated_at
from public.reimbursement_budgets
where budget_key = 'overall' and amount > 0;

alter table public.reimbursement_budgets
  drop constraint if exists reimbursement_budgets_budget_key_check;

delete from public.reimbursement_budgets where budget_key = 'overall';

alter table public.reimbursement_budgets
  add constraint reimbursement_budgets_budget_key_check check (
    budget_key in (
      'administration',
      'rush',
      'socials',
      'education',
      'philanthropy',
      'brother_bonding',
      'retreat'
    )
  );

revoke all on public.reimbursement_budget_entries from anon, authenticated;
grant select, insert, update, delete on public.reimbursement_budget_entries to authenticated;

alter table public.reimbursement_budget_entries enable row level security;

create policy "admins can view reimbursement budget entries"
  on public.reimbursement_budget_entries for select to authenticated
  using (public.is_admin());

create policy "admins can create reimbursement budget entries"
  on public.reimbursement_budget_entries for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy "admins can update reimbursement budget entries"
  on public.reimbursement_budget_entries for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete reimbursement budget entries"
  on public.reimbursement_budget_entries for delete to authenticated
  using (public.is_admin());

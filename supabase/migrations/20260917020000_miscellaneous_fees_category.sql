alter type public.reimbursement_category add value if not exists 'miscellaneous_fees';

alter table public.reimbursement_budgets
  drop constraint if exists reimbursement_budgets_budget_key_check;

alter table public.reimbursement_budgets
  add constraint reimbursement_budgets_budget_key_check check (
    budget_key in (
      'administration',
      'rush',
      'socials',
      'education',
      'philanthropy',
      'brother_bonding',
      'retreat',
      'house',
      'miscellaneous_fees'
    )
  );

insert into public.reimbursement_budgets (budget_key, amount)
values ('miscellaneous_fees', 690.00)
on conflict (budget_key) do nothing;

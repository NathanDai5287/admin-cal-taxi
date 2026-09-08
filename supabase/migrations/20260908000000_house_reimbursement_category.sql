alter type public.reimbursement_category add value if not exists 'house';

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
      'house'
    )
  );

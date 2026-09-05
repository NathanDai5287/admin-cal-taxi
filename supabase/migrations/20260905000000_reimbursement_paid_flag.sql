alter table public.reimbursements
  add column reimbursed boolean not null default false;

grant update (reimbursed) on public.reimbursements to authenticated;

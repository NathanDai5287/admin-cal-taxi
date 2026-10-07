create function public.guard_completed_category_approvals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed public.reimbursement_category[];
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'approved' and new.category = old.category
      and new.amount <= old.amount then return new; end if;
  end if;

  select completed_categories into completed
  from public.reimbursement_budgets
  where id
  for share;

  if new.category = any(completed) then
    raise exception 'Reopen the completed category before approving this reimbursement'
      using errcode = '23514', detail = new.category::text;
  end if;
  return new;
end;
$$;

create trigger reimbursements_completed_category_approval_guard
  before insert or update on public.reimbursements
  for each row execute function public.guard_completed_category_approvals();

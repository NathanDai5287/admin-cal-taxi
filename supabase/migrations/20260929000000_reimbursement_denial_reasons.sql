alter table public.reimbursements
  add column denial_reason text;

alter table public.reimbursements
  add constraint reimbursements_denial_reason_check
  check (denial_reason is null or char_length(denial_reason) between 1 and 500);

-- A denial note only makes sense while the submission is denied. Reversing
-- the decision from any client (web, Discord reactions, MCP) clears it.
create or replace function public.clear_denial_reason_when_not_denied()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'denied' then
    new.denial_reason := null;
  end if;
  return new;
end;
$$;

create trigger reimbursements_clear_denial_reason
  before insert or update of status on public.reimbursements
  for each row execute procedure public.clear_denial_reason_when_not_denied();

-- Members must not prefill a denial note on submission.
drop policy if exists "members can submit reimbursements for themselves"
  on public.reimbursements;
create policy "members can submit reimbursements for themselves"
  on public.reimbursements for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and merchant is null
    and receipt_date is null
    and receipt_total is null
    and failure_reason is null
    and denial_reason is null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('member', 'admin') and removed_at is null
    )
  );

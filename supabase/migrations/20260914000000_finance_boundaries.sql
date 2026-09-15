-- Preserve existing entries as actual income; new plans are explicitly forecasts.
alter table public.reimbursement_budget_entries
  add column kind text not null default 'income' check (kind in ('income', 'forecast'));

alter table public.reimbursement_manual_expenses
  add column receipt_path text;

-- Historical name-only balances remain visible until an admin links them.
-- Never infer identity from a potentially duplicated name.
alter table public.chapter_receivables
  add column member_id uuid references public.profiles(id) on delete restrict;
create index chapter_receivables_member_idx on public.chapter_receivables(member_id);

create function public.enforce_receivable_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member_name_value text;
begin
  if TG_OP = 'INSERT' or new.member_id is distinct from old.member_id then
    select full_name into member_name_value from public.profiles
      where id = new.member_id and role in ('member', 'admin') and removed_at is null;
    if not found then raise exception 'Choose an active registered member'; end if;
    new.member_name := member_name_value;
  elsif new.member_name is distinct from old.member_name then
    raise exception 'Change the member account instead of editing its name';
  end if;
  return new;
end;
$$;
create trigger chapter_receivables_registered_member
  before insert or update on public.chapter_receivables
  for each row execute function public.enforce_receivable_member();

-- Applies to website and Discord writes, including service-role writes.
create function public.enforce_reimbursement_payment_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reimbursed and new.status <> 'approved' then
    raise exception 'Only approved reimbursements can be paid';
  end if;
  if TG_OP = 'UPDATE' then
    if old.reimbursed and new.status is distinct from old.status then
      raise exception 'Correct the recorded payment before changing the review decision';
    end if;
    if old.status = 'pending' and new.status in ('approved', 'denied') then
      raise exception 'Wait for receipt processing to finish before reviewing';
    end if;
  end if;
  return new;
end;
$$;
create trigger reimbursements_payment_review_boundary
  before insert or update on public.reimbursements
  for each row execute function public.enforce_reimbursement_payment_review();

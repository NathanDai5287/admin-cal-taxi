drop policy if exists "members can submit reimbursements for themselves"
  on public.reimbursements;

alter table public.reimbursements
  alter column status drop default;

alter type public.reimbursement_status
  rename to reimbursement_status_legacy;

create type public.reimbursement_status as enum (
  'pending',
  'verified',
  'mismatch',
  'approved',
  'denied',
  'processing_failed'
);

alter table public.reimbursements
  alter column status type public.reimbursement_status
  using (
    case status::text
      when 'processing' then 'pending'
      when 'pending' then 'mismatch'
      else status::text
    end
  )::public.reimbursement_status,
  alter column status set default 'pending';

drop type public.reimbursement_status_legacy;

create policy "members can submit reimbursements for themselves"
  on public.reimbursements for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and merchant is null
    and receipt_date is null
    and receipt_total is null
    and failure_reason is null
  );

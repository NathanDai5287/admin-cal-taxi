alter table public.reimbursements
  add column approval_note text check (approval_note is null or char_length(approval_note) between 1 and 500),
  add column requested_amount numeric(10, 2) check (requested_amount > 0);

create function public.clear_approval_note_when_not_approved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'approved' then
    new.approval_note := null;
  end if;
  return new;
end;
$$;

create trigger reimbursements_clear_approval_note
  before insert or update of status on public.reimbursements
  for each row execute procedure public.clear_approval_note_when_not_approved();

alter policy reimbursement_own_submission on public.reimbursements
  with check (
    public.has_app_access('submit', 'write') and user_id = auth.uid() and status = 'pending'
    and merchant is null and receipt_date is null and receipt_total is null
    and failure_reason is null and denial_reason is null
    and approval_note is null and requested_amount is null
  );

alter table public.email_tracking_messages drop constraint email_tracking_messages_kind_check;
alter table public.email_tracking_messages add constraint email_tracking_messages_kind_check
  check (kind in ('hosting', 'invite', 'reimbursement'));

do $$
declare routine_definition text;
begin
  select pg_get_functiondef('public.mcp_admin_write(text, jsonb, uuid, boolean)'::regprocedure) into routine_definition;
  if position('status = coalesce((p_payload ->> ''status'')::public.reimbursement_status, status),' in routine_definition) = 0 then
    raise exception 'mcp_admin_write no longer updates reimbursement status as expected';
  end if;
  execute replace(routine_definition,
    'status = coalesce((p_payload ->> ''status'')::public.reimbursement_status, status),',
    'status = coalesce((p_payload ->> ''status'')::public.reimbursement_status, status),
        denial_reason = case when p_payload ->> ''status'' = ''denied'' then nullif(trim(p_payload ->> ''note''), '''') else denial_reason end,
        approval_note = case when p_payload ->> ''status'' = ''approved'' then nullif(trim(p_payload ->> ''note''), '''') else approval_note end,
        requested_amount = case when p_payload ->> ''status'' = ''approved'' and p_payload ? ''amount''
          then nullif(coalesce(reimbursements.requested_amount, reimbursements.amount), (p_payload ->> ''amount'')::numeric) else reimbursements.requested_amount end,
        amount = case when p_payload ->> ''status'' = ''approved'' and p_payload ? ''amount''
          then (p_payload ->> ''amount'')::numeric else reimbursements.amount end,');
end;
$$;

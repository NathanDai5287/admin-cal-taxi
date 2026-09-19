create function public.bulk_update_receivables(
  p_rows jsonb,
  p_due_date date,
  p_amount_assessed numeric,
  p_notes text,
  p_apply_due_date boolean,
  p_apply_amount boolean,
  p_apply_notes boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
  matched_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  requested_count := jsonb_array_length(p_rows);
  if requested_count < 1 or requested_count > 200 then
    raise exception 'Choose between 1 and 200 charges' using errcode = '22023';
  end if;
  if not (p_apply_due_date or p_apply_amount or p_apply_notes) then
    raise exception 'Choose at least one field to change' using errcode = '22023';
  end if;
  if p_apply_due_date and p_due_date is null then
    raise exception 'Choose a due date' using errcode = '22023';
  end if;
  if p_apply_amount and (p_amount_assessed is null or p_amount_assessed <= 0) then
    raise exception 'Enter an amount greater than zero' using errcode = '22023';
  end if;
  if p_apply_notes and char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;

  perform receivable.id
  from public.chapter_receivables receivable
  join jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
    on requested.id = receivable.id
  where receivable.waived_at is null
    and receivable.updated_at = requested.updated_at
  for update of receivable;

  get diagnostics matched_count = row_count;
  if matched_count <> requested_count then
    raise exception 'One or more charges changed. Refresh and try again' using errcode = '40001';
  end if;

  if p_apply_amount and exists (
    select 1
    from public.chapter_receivables receivable
    join jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
      on requested.id = receivable.id
    where p_amount_assessed < receivable.amount_paid
      or (receivable.amount_paid >= receivable.amount_assessed
        and p_amount_assessed is distinct from receivable.amount_assessed)
  ) then
    raise exception 'The amount cannot be below payments or change a fully paid charge' using errcode = '22023';
  end if;

  update public.chapter_receivables receivable
  set due_date = case when p_apply_due_date then p_due_date else receivable.due_date end,
      amount_assessed = case when p_apply_amount then p_amount_assessed else receivable.amount_assessed end,
      notes = case when p_apply_notes then coalesce(p_notes, '') else receivable.notes end
  from jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
  where receivable.id = requested.id;

  return true;
end;
$$;

revoke all on function public.bulk_update_receivables(jsonb, date, numeric, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.bulk_update_receivables(jsonb, date, numeric, text, boolean, boolean, boolean) to authenticated;

create function public.bulk_change_receivable_state(
  p_rows jsonb,
  p_action text,
  p_payment_date date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
  matched_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_action not in ('paid', 'reopened', 'waived') then
    raise exception 'Unknown charge action' using errcode = '22023';
  end if;

  requested_count := jsonb_array_length(p_rows);
  if requested_count < 1 or requested_count > 200 then
    raise exception 'Choose between 1 and 200 charges' using errcode = '22023';
  end if;

  perform receivable.id
  from public.chapter_receivables receivable
  join jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
    on requested.id = receivable.id
  where receivable.waived_at is null
    and receivable.updated_at = requested.updated_at
  for update of receivable;

  get diagnostics matched_count = row_count;
  if matched_count <> requested_count then
    raise exception 'One or more charges changed. Refresh and try again' using errcode = '40001';
  end if;

  if p_action = 'waived' then
    update public.chapter_receivables receivable
    set waived_at = now(), waived_by = auth.uid()
    from jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
    where receivable.id = requested.id;
  else
    perform set_config('app.dues_payment_date', p_payment_date::text, true);
    update public.chapter_receivables receivable
    set amount_paid = case when p_action = 'paid' then receivable.amount_assessed else 0 end
    from jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
    where receivable.id = requested.id;
  end if;

  return true;
end;
$$;

revoke all on function public.bulk_change_receivable_state(jsonb, text, date) from public, anon;
grant execute on function public.bulk_change_receivable_state(jsonb, text, date) to authenticated;

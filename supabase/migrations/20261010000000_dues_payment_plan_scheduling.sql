-- Keep a stable first-installment date; due_date is the calculated installment.
alter table public.chapter_receivables
  add column payment_plan_start_date date,
  add constraint chapter_receivables_plan_start_check check (
    payment_plan_start_date is null or payment_plan_start_date between date '0001-01-01' and date '9999-12-31'
  );

create function public.dues_plan_due_date(
  p_start date, p_frequency text, p_interval_days integer,
  p_amount numeric, p_paid numeric, p_assessed numeric
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  installment numeric;
  result date;
begin
  if p_start is null or not isfinite(p_start) or p_start not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Choose a valid first installment date' using errcode = '22023';
  end if;
  -- The last installment can be smaller than the agreed payment amount.
  installment := least(floor(p_paid / p_amount), greatest(ceil(p_assessed / p_amount) - 1, 0));
  if p_frequency = 'monthly' then
    result := (p_start + (installment::text || ' months')::interval)::date;
  else
    result := p_start + (installment * case p_frequency
      when 'weekly' then 7 when 'biweekly' then 14 when 'custom' then p_interval_days end)::integer;
  end if;
  if result is null or not isfinite(result) or result not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'The payment schedule exceeds the supported date range' using errcode = '22023';
  end if;
  return result;
exception when datetime_field_overflow or interval_field_overflow or numeric_value_out_of_range then
  raise exception 'The payment schedule exceeds the supported date range' using errcode = '22023';
end;
$$;
revoke all on function public.dues_plan_due_date(date, text, integer, numeric, numeric, numeric) from public, anon, authenticated;

create function public.schedule_receivable_payment_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- External due-date edits establish a new anchor. Computed dates are assigned
  -- in this BEFORE trigger and never issue another UPDATE.
  if tg_op = 'UPDATE' then
    if new.due_date is distinct from old.due_date
      and new.payment_plan_start_date is not distinct from old.payment_plan_start_date
      and (new.payment_plan_frequency is not null or old.payment_plan_start_date is not null) then
      new.payment_plan_start_date := new.due_date;
    end if;
  end if;
  if new.payment_plan_frequency is not null then
    new.payment_plan_start_date := coalesce(new.payment_plan_start_date, new.due_date);
    if new.payment_plan_amount > 0 then
      new.due_date := public.dues_plan_due_date(new.payment_plan_start_date,
        new.payment_plan_frequency, new.payment_plan_interval_days,
        new.payment_plan_amount, new.amount_paid, new.amount_assessed);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.schedule_receivable_payment_plan() from public, anon, authenticated;
create trigger chapter_receivables_schedule_plan
  before insert or update on public.chapter_receivables
  for each row execute function public.schedule_receivable_payment_plan();

-- Reconcile existing plans without modifying payments, events, notes, or terms.
update public.chapter_receivables
set payment_plan_start_date = due_date
where payment_plan_frequency is not null;

-- Optional date keeps older clients compatible during deployment.
drop function public.set_receivable_payment_plan(uuid, timestamptz, text, numeric, integer);
create function public.set_receivable_payment_plan(
  p_id uuid, p_updated_at timestamptz, p_frequency text,
  p_amount numeric, p_interval_days integer, p_start_date date default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.chapter_receivables%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_frequency is null then
    if p_amount is not null or p_interval_days is not null then
      raise exception 'Remove all payment plan terms together' using errcode = '22023';
    end if;
  else
    if p_frequency not in ('weekly', 'biweekly', 'monthly', 'custom') then
      raise exception 'Choose a valid payment frequency' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 or p_amount > 999999999.99 or p_amount <> round(p_amount, 2) then
      raise exception 'Enter a positive payment amount with at most two decimal places' using errcode = '22023';
    end if;
    if (p_frequency = 'custom' and (p_interval_days is null or p_interval_days <= 0))
      or (p_frequency <> 'custom' and p_interval_days is not null) then
      raise exception 'Choose a valid payment interval' using errcode = '22023';
    end if;
  end if;
  select * into charge from public.chapter_receivables where id = p_id for update;
  if not found or charge.waived_at is not null or charge.updated_at is distinct from p_updated_at then
    raise exception 'This charge changed. Refresh and try again' using errcode = '40001';
  end if;
  if charge.amount_paid >= charge.amount_assessed then
    raise exception 'Payment plans can only be edited on outstanding charges' using errcode = '22023';
  end if;
  update public.chapter_receivables
  set payment_plan_frequency = p_frequency,
      payment_plan_amount = p_amount,
      payment_plan_interval_days = p_interval_days,
      payment_plan_start_date = case when p_frequency is null then charge.payment_plan_start_date
        else coalesce(p_start_date, charge.payment_plan_start_date, charge.due_date) end
  where id = p_id;
  return true;
end;
$$;
revoke all on function public.set_receivable_payment_plan(uuid, timestamptz, text, numeric, integer, date) from public, anon;
grant execute on function public.set_receivable_payment_plan(uuid, timestamptz, text, numeric, integer, date) to authenticated;

-- An explicitly selected bulk date is always a first-installment date for plans.
create or replace function public.bulk_update_receivables(
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
      payment_plan_start_date = case when p_apply_due_date and (receivable.payment_plan_frequency is not null or receivable.payment_plan_start_date is not null) then p_due_date else receivable.payment_plan_start_date end,
      amount_assessed = case when p_apply_amount then p_amount_assessed else receivable.amount_assessed end,
      notes = case when p_apply_notes then coalesce(p_notes, '') else receivable.notes end
  from jsonb_to_recordset(p_rows) as requested(id uuid, updated_at timestamptz)
  where receivable.id = requested.id;

  return true;
end;
$$;

revoke all on function public.bulk_update_receivables(jsonb, date, numeric, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.bulk_update_receivables(jsonb, date, numeric, text, boolean, boolean, boolean) to authenticated;

-- Plan terms are metadata: existing balances and payment events are unchanged.
alter table public.chapter_receivables
  add column payment_plan_frequency text,
  add column payment_plan_amount numeric(12, 2),
  add column payment_plan_interval_days integer,
  add constraint chapter_receivables_payment_plan_check check (
    (payment_plan_frequency is null and payment_plan_amount is null and payment_plan_interval_days is null)
    or (
      payment_plan_frequency is not null
      and payment_plan_frequency in ('weekly', 'biweekly', 'monthly', 'custom')
      and payment_plan_amount is not null
      and payment_plan_amount > 0 and payment_plan_amount <= 999999999.99
      and (
        (payment_plan_frequency = 'custom' and payment_plan_interval_days is not null and payment_plan_interval_days > 0)
        or (payment_plan_frequency <> 'custom' and payment_plan_interval_days is null)
      )
    )
  );

create function public.set_receivable_payment_plan(
  p_id uuid,
  p_updated_at timestamptz,
  p_frequency text,
  p_amount numeric,
  p_interval_days integer
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
      payment_plan_interval_days = p_interval_days
  where id = p_id;
  return true;
end;
$$;

revoke all on function public.set_receivable_payment_plan(uuid, timestamptz, text, numeric, integer) from public, anon;
grant execute on function public.set_receivable_payment_plan(uuid, timestamptz, text, numeric, integer) to authenticated;

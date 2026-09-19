create type public.hosting_finance_status as enum ('confirmed', 'cancelled');
create type public.hosting_payment_kind as enum ('revenue', 'fire_permit');

alter table public.chapter_receivables
  add column waived_at timestamptz,
  add column waived_by uuid references public.profiles(id) on delete set null;

create index chapter_receivables_active_due_date_idx
  on public.chapter_receivables (due_date)
  where waived_at is null;

create table public.chapter_dues_payment_events (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.chapter_receivables(id) on delete restrict,
  amount numeric(12, 2) not null check (amount <> 0),
  paid_date date not null,
  date_is_estimated boolean not null default false,
  created_at timestamptz not null default now()
);

create index chapter_dues_payment_events_date_idx
  on public.chapter_dues_payment_events (paid_date, receivable_id);

create or replace function public.reject_paid_charge_amount_edit()
returns trigger
language plpgsql
as $$
begin
  if old.amount_paid >= old.amount_assessed
    and new.amount_assessed is distinct from old.amount_assessed
    and new.amount_paid is distinct from old.amount_paid then
    raise exception 'A paid charge amount cannot be changed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger chapter_receivables_protect_paid_amount
  before update of amount_assessed, amount_paid on public.chapter_receivables
  for each row execute procedure public.reject_paid_charge_amount_edit();

insert into public.chapter_dues_payment_events (
  receivable_id, amount, paid_date, date_is_estimated, created_at
)
select
  receivable.id,
  receivable.amount_paid,
  (coalesce((
    select max(request.created_at)
    from public.dues_payment_requests request
    where request.receivable_id = receivable.id
  ), receivable.updated_at) at time zone 'America/Los_Angeles')::date,
  true,
  receivable.updated_at
from public.chapter_receivables receivable
where receivable.amount_paid > 0;

create or replace function public.record_dues_payment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_date date;
begin
  if new.amount_paid = old.amount_paid then return new; end if;
  event_date := coalesce(nullif(current_setting('app.dues_payment_date', true), '')::date, current_date);
  insert into public.chapter_dues_payment_events (
    receivable_id, amount, paid_date, date_is_estimated
  ) values (
    new.id,
    new.amount_paid - old.amount_paid,
    event_date,
    false
  );
  return new;
end;
$$;

create trigger chapter_receivables_record_payment_event
  after update of amount_paid on public.chapter_receivables
  for each row execute procedure public.record_dues_payment_event();

revoke all on public.chapter_dues_payment_events from anon, authenticated;
grant select on public.chapter_dues_payment_events to authenticated;
alter table public.chapter_dues_payment_events enable row level security;

create policy "admins can view dues payment events"
  on public.chapter_dues_payment_events for select to authenticated
  using (public.is_admin());

create or replace function public.waive_receivable_instead_of_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chapter_receivables
  set waived_at = coalesce(waived_at, now()),
      waived_by = coalesce(waived_by, auth.uid())
  where id = old.id;
  return null;
end;
$$;

create trigger chapter_receivables_preserve_history
  before delete on public.chapter_receivables
  for each row execute procedure public.waive_receivable_instead_of_delete();

drop function if exists public.record_dues_payment(uuid, numeric, uuid);
create function public.record_dues_payment(
  p_receivable_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_payment_amount <= 0 then return false; end if;

  insert into public.dues_payment_requests (request_id, receivable_id)
  values (p_request_id, p_receivable_id)
  on conflict (request_id) do nothing;
  if not found then return true; end if;

  perform set_config('app.dues_payment_date', p_payment_date::text, true);
  update public.chapter_receivables
  set amount_paid = amount_paid + p_payment_amount
  where id = p_receivable_id
    and waived_at is null
    and amount_paid + p_payment_amount <= amount_assessed;
  if not found then
    delete from public.dues_payment_requests where request_id = p_request_id;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.record_dues_payment(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.record_dues_payment(uuid, numeric, date, uuid) to authenticated;

drop function if exists public.set_dues_paid_state(uuid, boolean);
create function public.set_dues_paid_state(p_receivable_id uuid, p_paid boolean, p_payment_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform set_config('app.dues_payment_date', p_payment_date::text, true);
  update public.chapter_receivables
  set amount_paid = case when p_paid then amount_assessed else 0 end
  where id = p_receivable_id and waived_at is null;
  return found;
end;
$$;

revoke all on function public.set_dues_paid_state(uuid, boolean, date) from public, anon;
grant execute on function public.set_dues_paid_state(uuid, boolean, date) to authenticated;

alter table public.reimbursements
  add column reimbursed_at timestamptz,
  add column reimbursement_date_is_estimated boolean not null default false;

update public.reimbursements
set reimbursed_at = updated_at,
    reimbursement_date_is_estimated = true
where reimbursed;

create or replace function public.set_reimbursement_payment_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.reimbursed then
      new.reimbursed_at = now();
      new.reimbursement_date_is_estimated = false;
    end if;
    return new;
  end if;
  if new.reimbursed and not old.reimbursed then
    new.reimbursed_at = now();
    new.reimbursement_date_is_estimated = false;
  elsif not new.reimbursed then
    new.reimbursed_at = null;
    new.reimbursement_date_is_estimated = false;
  end if;
  return new;
end;
$$;

create trigger reimbursements_set_payment_date
  before insert or update of reimbursed on public.reimbursements
  for each row execute procedure public.set_reimbursement_payment_date();

create table public.hosting_finance_orders (
  order_id text primary key check (char_length(order_id) between 1 and 200),
  organization text not null check (char_length(organization) between 1 and 200),
  event_date date not null,
  planned_revenue numeric(12, 2) not null check (planned_revenue >= 0),
  planned_fire_permit numeric(12, 2) not null check (planned_fire_permit >= 0),
  status public.hosting_finance_status not null default 'confirmed',
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger hosting_finance_orders_set_updated_at
  before update on public.hosting_finance_orders
  for each row execute procedure public.set_updated_at();

create index hosting_finance_orders_event_date_idx
  on public.hosting_finance_orders (event_date, status);

create table public.hosting_finance_payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.hosting_finance_orders(order_id) on delete cascade,
  kind public.hosting_payment_kind not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_date date not null,
  request_id uuid not null unique,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 1 and 500)
);

create index hosting_finance_payments_date_idx
  on public.hosting_finance_payments (paid_date, kind);

revoke all on public.hosting_finance_orders from anon, authenticated;
grant select, insert, update on public.hosting_finance_orders to authenticated;
alter table public.hosting_finance_orders enable row level security;

create policy "admins can view hosting finance orders"
  on public.hosting_finance_orders for select to authenticated
  using (public.is_admin());
create policy "admins can create hosting finance orders"
  on public.hosting_finance_orders for insert to authenticated
  with check (public.is_admin() and confirmed_by = auth.uid());
create policy "admins can update hosting finance orders"
  on public.hosting_finance_orders for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.hosting_finance_payments from anon, authenticated;
grant select on public.hosting_finance_payments to authenticated;
alter table public.hosting_finance_payments enable row level security;

create policy "admins can view hosting finance payments"
  on public.hosting_finance_payments for select to authenticated
  using (public.is_admin());

create function public.record_hosting_payment(
  p_order_id text,
  p_kind public.hosting_payment_kind,
  p_amount numeric,
  p_paid_date date,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  finance_order public.hosting_finance_orders;
  existing_payment public.hosting_finance_payments;
  payment_limit numeric;
  recorded_total numeric;
  payment_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into existing_payment
  from public.hosting_finance_payments
  where request_id = p_request_id;
  if found then
    if existing_payment.order_id <> p_order_id
      or existing_payment.kind <> p_kind
      or existing_payment.amount <> p_amount
      or existing_payment.paid_date <> p_paid_date then
      raise exception 'This request ID belongs to a different payment' using errcode = '22023';
    end if;
    return existing_payment.id;
  end if;

  select * into finance_order
  from public.hosting_finance_orders
  where order_id = p_order_id
  for update;
  if not found or finance_order.status <> 'confirmed' then
    raise exception 'Only confirmed contracts can receive payments' using errcode = '22023';
  end if;

  payment_limit := case p_kind
    when 'revenue' then finance_order.planned_revenue
    when 'fire_permit' then finance_order.planned_fire_permit
  end;
  select coalesce(sum(amount), 0) into recorded_total
  from public.hosting_finance_payments
  where order_id = p_order_id and kind = p_kind and reversed_at is null;
  if p_amount <= 0 or recorded_total + p_amount > payment_limit then
    raise exception 'Payment exceeds the confirmed amount' using errcode = '22023';
  end if;

  insert into public.hosting_finance_payments (
    order_id, kind, amount, paid_date, request_id, recorded_by
  ) values (
    p_order_id, p_kind, p_amount, p_paid_date, p_request_id, auth.uid()
  ) returning id into payment_id;
  return payment_id;
end;
$$;

revoke all on function public.record_hosting_payment(text, public.hosting_payment_kind, numeric, date, uuid) from public, anon;
grant execute on function public.record_hosting_payment(text, public.hosting_payment_kind, numeric, date, uuid) to authenticated;

create or replace function public.mcp_finance_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required';
  end if;
  select jsonb_build_object(
    'currency', 'USD',
    'openingCash', coalesce((select opening_cash from public.chapter_financial_settings where id), 0),
    'recordedIncome', coalesce((select sum(amount) from public.reimbursement_budget_entries where kind = 'income'), 0),
    'approvedSpending',
      coalesce((select sum(amount) from public.reimbursements where status = 'approved'), 0)
      + coalesce((select sum(amount) from public.reimbursement_manual_expenses), 0),
    'cashPosition',
      coalesce((select opening_cash from public.chapter_financial_settings where id), 0)
      + coalesce((select sum(amount) from public.reimbursement_budget_entries where kind = 'income'), 0)
      - coalesce((select sum(amount) from public.reimbursements where status = 'approved' and reimbursed), 0)
      - coalesce((select sum(amount) from public.reimbursement_manual_expenses), 0),
    'accountsReceivable', coalesce((
      select sum(greatest(0, amount_assessed - amount_paid))
      from public.chapter_receivables
      where waived_at is null
    ), 0),
    'reimbursementsToPay', coalesce((
      select sum(amount) from public.reimbursements where status = 'approved' and not reimbursed
    ), 0)
  ) into result;
  insert into public.mcp_audit_log (user_id, client_id, tool_name)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'get_finance_overview');
  return result;
end;
$$;

create or replace function public.mcp_open_dues()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required';
  end if;
  select jsonb_build_object(
    'currency', 'USD',
    'balances', coalesce(jsonb_agg(jsonb_build_object(
      'memberName', member_name,
      'amountAssessed', amount_assessed,
      'amountPaid', amount_paid,
      'outstanding', amount_assessed - amount_paid,
      'dueDate', due_date
    ) order by due_date, member_name) filter (
      where waived_at is null and amount_assessed > amount_paid
    ), '[]'::jsonb)
  ) into result
  from public.chapter_receivables;
  insert into public.mcp_audit_log (user_id, client_id, tool_name)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'list_open_dues');
  return result;
end;
$$;

revoke all on function public.mcp_finance_overview() from public, anon, authenticated;
revoke all on function public.mcp_open_dues() from public, anon, authenticated;
grant execute on function public.mcp_finance_overview() to authenticated;
grant execute on function public.mcp_open_dues() to authenticated;

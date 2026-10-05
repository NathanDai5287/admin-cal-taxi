-- Refundable deposits are held funds, separate from rental income and expenses.
create table public.hosting_deposit_payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.hosting_finance_orders(order_id),
  amount numeric(12,2) not null check (amount > 0),
  paid_date date not null,
  request_id uuid not null unique,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text
);
alter table public.hosting_deposit_payments enable row level security;
revoke all on public.hosting_deposit_payments from public, anon, authenticated;
grant select, insert, update on public.hosting_deposit_payments to service_role;

create function public.hosting_deposit_payment_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.order_id,new.amount,new.paid_date,new.request_id,new.recorded_by,new.created_at)
    is distinct from row(old.id,old.order_id,old.amount,old.paid_date,old.request_id,old.recorded_by,old.created_at)
    or (old.reversed_at is not null and row(new.reversed_at,new.reversed_by,new.reversal_reason)
      is distinct from row(old.reversed_at,old.reversed_by,old.reversal_reason)) then
    raise exception 'Recorded deposits are immutable; undo and re-record instead';
  end if;
  return new;
end; $$;
create trigger hosting_deposit_payment_guard before update on public.hosting_deposit_payments
  for each row execute function public.hosting_deposit_payment_guard();

-- Only the authenticated admin server action supplies the saved contract limit.
create function public.record_hosting_deposit(p_order_id text, p_amount numeric,
  p_limit numeric, p_paid_date date, p_request_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.hosting_deposit_payments; payment_id uuid; recorded numeric;
begin
  if not exists(select 1 from public.profiles where id=p_user_id and role='admin') then
    raise exception 'Administrator access required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hosting_event/' || p_order_id, 0));
  select * into existing from public.hosting_deposit_payments where request_id=p_request_id;
  if found then
    if existing.order_id <> p_order_id or existing.amount <> p_amount or existing.paid_date <> p_paid_date then
      raise exception 'This request ID belongs to a different deposit';
    end if;
    return existing.id;
  end if;
  if not exists(select 1 from public.hosting_finance_orders where order_id=p_order_id and status='confirmed')
    or exists(select 1 from public.hosting_event_state where order_id=p_order_id and cancelled_at is not null) then
    raise exception 'Only active sent contracts can receive deposits';
  end if;
  select coalesce(sum(amount),0) into recorded from public.hosting_deposit_payments where order_id=p_order_id and reversed_at is null;
  if p_limit is null or p_limit <= 0 or p_amount is null or p_amount <= 0 or recorded+p_amount > p_limit or p_paid_date > current_date then
    raise exception 'Deposit exceeds the contract amount or has an invalid payment date';
  end if;
  insert into public.hosting_deposit_payments(order_id,amount,paid_date,request_id,recorded_by)
    values(p_order_id,p_amount,p_paid_date,p_request_id,p_user_id) returning id into payment_id;
  return payment_id;
end; $$;
revoke all on function public.record_hosting_deposit(text,numeric,numeric,date,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_hosting_deposit(text,numeric,numeric,date,uuid,uuid) to service_role;

alter table public.hosting_email_deliveries drop constraint hosting_email_deliveries_kind_check;
alter table public.hosting_email_deliveries add constraint hosting_email_deliveries_kind_check
  check(kind in ('invitation','reminder','completed','deposit_invoice','rental_invoice','deposit_receipt','receipt','refund'));

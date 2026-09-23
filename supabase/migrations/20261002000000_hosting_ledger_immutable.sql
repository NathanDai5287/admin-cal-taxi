-- Hosting ledger hardening: confirmed contracts and recorded payments are
-- ledger entries, not drafts. Once written, their terms may not be edited
-- in place — the honest correction path is cancel/reverse and re-do, which
-- leaves a visible trail.
--
-- What this enforces at the database level (regardless of which client or
-- role issues the UPDATE):
--   hosting_finance_orders: order_id never changes; organization, event_date,
--     planned_revenue and planned_fire_permit are frozen EXCEPT on a
--     cancelled → confirmed transition, which is a fresh confirmation
--     decision and may refresh the terms from the current order.
--   hosting_finance_payments: order_id, kind, amount, paid_date and
--     request_id never change. Only the reversal columns (reversed_at,
--     reversed_by, reversal_reason) may be set — payments are never
--     rewritten, only reversed.

create or replace function public.hosting_finance_orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_id is distinct from old.order_id then
    raise exception 'order_id is immutable' using errcode = '22023';
  end if;
  -- Terms may only change on cancelled → confirmed (re-confirmation).
  if not (old.status = 'cancelled' and new.status = 'confirmed') then
    if new.organization is distinct from old.organization
      or new.event_date is distinct from old.event_date
      or new.planned_revenue is distinct from old.planned_revenue
      or new.planned_fire_permit is distinct from old.planned_fire_permit then
      raise exception 'Contract terms are immutable once confirmed — cancel and re-confirm to change them'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger hosting_finance_orders_guard_update
  before update on public.hosting_finance_orders
  for each row execute procedure public.hosting_finance_orders_guard();

create or replace function public.hosting_finance_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_id is distinct from old.order_id
    or new.kind is distinct from old.kind
    or new.amount is distinct from old.amount
    or new.paid_date is distinct from old.paid_date
    or new.request_id is distinct from old.request_id then
    raise exception 'Recorded payments are immutable — reverse and re-record instead'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger hosting_finance_payments_guard_update
  before update on public.hosting_finance_payments
  for each row execute procedure public.hosting_finance_payments_guard();

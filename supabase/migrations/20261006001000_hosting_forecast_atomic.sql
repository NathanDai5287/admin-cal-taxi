-- Serialize cancellation and automatic forecast insertion. Existing finance
-- rows remain immutable; cancellation cannot race a new forecast into existence.
create function public.ensure_hosting_forecast(p_order_id text, p_organization text,
  p_event_date date, p_revenue numeric, p_fire_permit numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('hosting_event/' || p_order_id, 0));
  if exists(select 1 from public.hosting_event_state where order_id = p_order_id and cancelled_at is not null) then return; end if;
  insert into public.hosting_finance_orders(order_id, organization, event_date, planned_revenue, planned_fire_permit)
    values(p_order_id, p_organization, p_event_date, p_revenue, p_fire_permit)
    on conflict(order_id) do nothing;
end; $$;
revoke all on function public.ensure_hosting_forecast(text,text,date,numeric,numeric) from public, anon, authenticated;
grant execute on function public.ensure_hosting_forecast(text,text,date,numeric,numeric) to service_role;

create or replace function public.cancel_hosting_event(p_order_id text, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('hosting_event/' || p_order_id, 0));
  insert into public.hosting_event_state(order_id, cancelled_at, cancelled_by)
    values(p_order_id, now(), p_user_id)
    on conflict(order_id) do update set cancelled_at = coalesce(hosting_event_state.cancelled_at, excluded.cancelled_at), cancelled_by = excluded.cancelled_by;
  update public.hosting_finance_orders set status = 'cancelled', cancelled_at = now()
    where order_id = p_order_id and status = 'confirmed';
end; $$;

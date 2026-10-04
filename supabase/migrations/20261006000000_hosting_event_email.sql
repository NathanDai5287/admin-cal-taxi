-- Additive workflow metadata only. The order/signing store is not touched.
create table public.hosting_event_settings (
  singleton boolean primary key default true check (singleton),
  activated_at timestamptz not null default now()
);
insert into public.hosting_event_settings(singleton) values(true);
create table public.hosting_event_state (
  order_id text primary key,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  refund_amount numeric(12,2) check (refund_amount > 0),
  refund_date date,
  refund_method text,
  check ((refund_amount is null and refund_date is null and refund_method is null)
    or (refund_amount is not null and refund_date is not null and length(trim(refund_method)) > 0))
);
create table public.hosting_signing_references (
  revision_id text primary key,
  order_id text not null,
  envelope_id text not null
);
create index hosting_signing_references_order_idx on public.hosting_signing_references(order_id);
create table public.hosting_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  order_id text not null,
  revision_id text,
  kind text not null check (kind in ('invitation','reminder','completed','deposit_invoice','rental_invoice','receipt','refund')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','uncertain')),
  -- Frozen recipient-specific body and exact PDF bytes. Never exposed to clients.
  payload jsonb not null,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  first_attempted_at timestamptz,
  sent_at timestamptz
);
create index hosting_email_deliveries_order_idx on public.hosting_email_deliveries(order_id, created_at desc);
alter table public.hosting_event_settings enable row level security;
alter table public.hosting_event_state enable row level security;
alter table public.hosting_signing_references enable row level security;
alter table public.hosting_email_deliveries enable row level security;
-- Workflow writes and private links/PDFs are service-role only; admin actions
-- authenticate separately. Authenticated browser clients have no policies.
revoke all on public.hosting_event_settings, public.hosting_event_state,
  public.hosting_signing_references, public.hosting_email_deliveries from anon, authenticated;
grant all on public.hosting_event_settings, public.hosting_event_state,
  public.hosting_signing_references, public.hosting_email_deliveries to service_role;

create function public.claim_hosting_email(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  -- Resend keeps idempotency keys for 24h. Never blindly retry ambiguous
  -- delivery beyond that window; an operator must check provider logs.
  update public.hosting_email_deliveries set status = 'uncertain', error = 'Delivery needs review in Resend before retrying.'
  where id = p_id and status <> 'sent' and attempted_at is not null
    and first_attempted_at < now() - interval '23 hours';
  update public.hosting_email_deliveries set status = 'sending', attempted_at = now(), first_attempted_at = coalesce(first_attempted_at, now()), error = null
  where id = p_id and (first_attempted_at is null or first_attempted_at > now() - interval '23 hours')
    and (status in ('queued','failed') or (status = 'sending' and attempted_at < now() - interval '90 seconds'))
  returning id into claimed;
  return claimed is not null;
end; $$;
revoke all on function public.claim_hosting_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_hosting_email(uuid) to service_role;

create function public.cancel_hosting_event(p_order_id text, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.hosting_event_state(order_id, cancelled_at, cancelled_by)
    values(p_order_id, now(), p_user_id)
    on conflict(order_id) do update set cancelled_at = coalesce(hosting_event_state.cancelled_at, excluded.cancelled_at), cancelled_by = excluded.cancelled_by;
  update public.hosting_finance_orders set status = 'cancelled', cancelled_at = now()
    where order_id = p_order_id and status = 'confirmed';
end; $$;
revoke all on function public.cancel_hosting_event(text,uuid) from public, anon, authenticated;
grant execute on function public.cancel_hosting_event(text,uuid) to service_role;

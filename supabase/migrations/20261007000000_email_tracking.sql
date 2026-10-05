create table public.email_tracking_messages (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  message_key text not null unique,
  kind text not null check (kind in ('hosting', 'invite')),
  related_id text,
  recipient text not null,
  subject text not null,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.email_tracking_events (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.email_tracking_messages(id),
  kind text not null check (kind in ('opened', 'clicked')),
  url text,
  occurred_at timestamptz not null default now(),
  check ((kind = 'opened' and url is null) or (kind = 'clicked' and url is not null))
);
create index email_tracking_messages_related on public.email_tracking_messages(related_id, created_at desc);
create index email_tracking_events_message on public.email_tracking_events(message_id, occurred_at desc);
alter table public.email_tracking_messages enable row level security;
alter table public.email_tracking_events enable row level security;
revoke all on public.email_tracking_messages, public.email_tracking_events from public, anon, authenticated;
grant select, insert, update on public.email_tracking_messages to service_role;
grant select, insert on public.email_tracking_events to service_role;
grant usage, select on sequence public.email_tracking_events_id_seq to service_role;

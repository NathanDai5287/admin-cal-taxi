create table public.venue_inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  organization text not null check (char_length(organization) between 2 and 160),
  event_type text not null check (char_length(event_type) between 2 and 80),
  event_date date,
  guest_count integer check (guest_count between 1 and 200),
  details text not null check (char_length(details) between 10 and 3000),
  source_hash text not null check (char_length(source_hash) = 64),
  submitted_at timestamptz not null default now()
);

create index venue_inquiries_submitted_at_idx
  on public.venue_inquiries (submitted_at desc);

create index venue_inquiries_source_hash_submitted_at_idx
  on public.venue_inquiries (source_hash, submitted_at desc);

revoke all on public.venue_inquiries from anon, authenticated;
alter table public.venue_inquiries enable row level security;

grant select on public.venue_inquiries to authenticated;
grant select, insert on public.venue_inquiries to service_role;

create policy "administrators can read venue inquiries"
  on public.venue_inquiries
  for select
  to authenticated
  using (public.is_admin());

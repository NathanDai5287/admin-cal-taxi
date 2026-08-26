create extension if not exists pgcrypto;

create type public.app_role as enum ('member', 'admin');
create type public.reimbursement_category as enum (
  'food', 'supplies', 'travel', 'events', 'utilities', 'other'
);
create type public.reimbursement_status as enum (
  'processing', 'pending', 'verified', 'approved', 'denied', 'processing_failed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  category public.reimbursement_category not null,
  amount numeric(10, 2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 2000),
  payment_method text not null check (char_length(payment_method) between 1 and 200),
  receipt_path text not null,
  status public.reimbursement_status not null default 'processing',
  merchant text,
  receipt_date date,
  receipt_total numeric(10, 2),
  failure_reason text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reimbursements_user_id_submitted_at_idx
  on public.reimbursements (user_id, submitted_at desc);
create index reimbursements_status_submitted_at_idx
  on public.reimbursements (status, submitted_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reimbursements_set_updated_at
  before update on public.reimbursements
  for each row execute procedure public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on public.profiles from anon, authenticated;
revoke all on public.reimbursements from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert on public.reimbursements to authenticated;
grant update (status) on public.reimbursements to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.reimbursements enable row level security;

create policy "profiles are visible to their owner or admins"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "members can update their own name"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "members can view their reimbursements and admins can view all"
  on public.reimbursements for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "members can submit reimbursements for themselves"
  on public.reimbursements for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'processing'
    and merchant is null
    and receipt_date is null
    and receipt_total is null
    and failure_reason is null
  );

create policy "admins can change reimbursement status"
  on public.reimbursements for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "members can upload receipts into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members can read their receipts and admins can read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

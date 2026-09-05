-- Default new profiles to no access, add admin-managed invites that are
-- consumed on signup, and let admins update profiles.

alter table public.profiles alter column role set default 'none';

create table public.invites (
  email text primary key check (email = lower(email)),
  role public.app_role not null default 'member',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on public.invites from anon, authenticated;
grant select, insert, update, delete on public.invites to authenticated;

alter table public.invites enable row level security;

create policy "admins can manage invites"
  on public.invites for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update on public.profiles to authenticated;

create policy "admins can update profiles"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  invite_role public.app_role;
begin
  delete from public.invites
  where email = lower(coalesce(new.email, ''))
  returning role into invite_role;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(invite_role, 'none')
  );
  return new;
end;
$$;

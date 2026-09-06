-- Default new profiles to no access, add admin-managed invites that are
-- consumed on signup, and let admins update profiles.
alter table public.profiles alter column role set default 'none';

create table public.invites (
  email text primary key check (email = lower(email)),
  role public.app_role not null default 'member' check (role in ('member', 'admin')),
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

create or replace function public.admin_set_profile_role(
  target_user_id uuid,
  new_role public.app_role
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;

  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

revoke all on function public.admin_set_profile_role(uuid, public.app_role) from anon, authenticated;
grant execute on function public.admin_set_profile_role(uuid, public.app_role) to authenticated;

create or replace function public.admin_invite_email(
  invite_email text,
  invite_role public.app_role
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can invite users';
  end if;

  if invite_role not in ('member', 'admin') then
    raise exception 'invites must be for member or admin';
  end if;

  if exists (
    select 1 from public.profiles where email = lower(invite_email)
  ) then
    update public.profiles set role = invite_role where email = lower(invite_email);
    delete from public.invites where email = lower(invite_email);
  else
    insert into public.invites (email, role, invited_by)
    values (lower(invite_email), invite_role, auth.uid())
    on conflict (email) do update
    set role = excluded.role, invited_by = excluded.invited_by;
  end if;
end;
$$;

revoke all on function public.admin_invite_email(text, public.app_role) from anon, authenticated;
grant execute on function public.admin_invite_email(text, public.app_role) to authenticated;

drop policy "members can submit reimbursements for themselves"
  on public.reimbursements;

create policy "members can submit reimbursements for themselves"
  on public.reimbursements for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and merchant is null
    and receipt_date is null
    and receipt_total is null
    and failure_reason is null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('member', 'admin')
    )
  );

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
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    coalesce(new.email, ''),
    coalesce(invite_role, 'none')
  );

  return new;
end;
$$;

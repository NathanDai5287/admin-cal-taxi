-- Give invited people a profile immediately so admins can use them anywhere
-- that expects a member (most importantly, accounts receivable) before their
-- first sign-in. The provisional profile keeps its UUID when possible and is
-- re-keyed to the Supabase auth UUID when the invitation is accepted.

alter table public.profiles
  drop constraint profiles_id_fkey;

alter table public.profiles
  add column has_signed_in boolean not null default true;

create unique index profiles_normalized_email_idx
  on public.profiles (lower(email))
  where email <> '';

-- Dues are the one member-owned record admins can create before a member has
-- signed in. Carry those records along when the provisional UUID is replaced.
alter table public.chapter_receivables
  drop constraint chapter_receivables_member_id_fkey;
alter table public.chapter_receivables
  add constraint chapter_receivables_member_id_fkey
  foreign key (member_id) references public.profiles(id)
  on update cascade on delete restrict;

-- Existing pending invitations become provisional profiles during rollout.
insert into public.profiles (id, full_name, email, role, has_signed_in)
select gen_random_uuid(), '', lower(trim(invite.email)), invite.role, false
from public.invites as invite
where not exists (
  select 1 from public.profiles as profile
  where lower(profile.email) = lower(trim(invite.email))
);

create or replace function public.admin_invite_email(invite_email text, invite_role public.app_role)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_email text := lower(trim(invite_email));
  profile_has_signed_in boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can invite users';
  end if;
  if invite_role not in ('member', 'admin') then
    raise exception 'invites must be for member or admin';
  end if;
  if normalized_email = '' then
    raise exception 'invite email is required';
  end if;

  update public.profiles
  set role = invite_role, removed_at = null
  where lower(email) = normalized_email
  returning has_signed_in into profile_has_signed_in;

  if found and profile_has_signed_in then
    delete from public.invites where email = normalized_email;
    return;
  end if;

  if not found then
    insert into public.profiles (id, full_name, email, role, has_signed_in)
    values (gen_random_uuid(), '', normalized_email, invite_role, false);
  end if;

  insert into public.invites (email, role, invited_by)
  values (normalized_email, invite_role, auth.uid())
  on conflict (email) do update
  set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
end;
$$;

create or replace function public.admin_set_profile_role(target_user_id uuid, new_role public.app_role)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  target_email text;
  target_has_signed_in boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  if new_role not in ('member', 'admin') then
    raise exception 'role must be member or admin';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id and removed_at is null
  returning email, has_signed_in into target_email, target_has_signed_in;

  if not found then
    raise exception 'user not found';
  end if;

  if not target_has_signed_in then
    update public.invites set role = new_role where email = lower(target_email);
  end if;
end;
$$;

create or replace function public.admin_remove_profile(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  target_email text;
  target_has_signed_in boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can remove users';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;

  update public.profiles
  set removed_at = now()
  where id = target_user_id
  returning email, has_signed_in into target_email, target_has_signed_in;

  if found and not target_has_signed_in then
    delete from public.invites where email = lower(target_email);
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(new.email, '')));
  resolved_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(concat_ws(' ',
      new.raw_user_meta_data ->> 'given_name',
      new.raw_user_meta_data ->> 'family_name')), ''),
    ''
  );
  provisional_id uuid;
  invite_role public.app_role;
begin
  select id, role into provisional_id, invite_role
  from public.profiles
  where lower(email) = normalized_email and not has_signed_in
  for update;

  if provisional_id is not null then
    update public.profiles
    set id = new.id,
        full_name = resolved_name,
        email = normalized_email,
        role = invite_role,
        has_signed_in = true,
        removed_at = null
    where id = provisional_id;
  else
    delete from public.invites
    where email = normalized_email
    returning role into invite_role;

    insert into public.profiles (id, full_name, email, role, has_signed_in)
    values (new.id, resolved_name, normalized_email, coalesce(invite_role, 'none'), true);
  end if;

  delete from public.invites where email = normalized_email;
  return new;
end;
$$;

create or replace function public.claim_pending_invite()
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_name text;
  provisional_id uuid;
  invited_role public.app_role;
begin
  if current_user_id is null then
    return false;
  end if;

  select
    lower(trim(coalesce(app_user.email, ''))),
    coalesce(
      nullif(trim(app_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(app_user.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(concat_ws(' ',
        app_user.raw_user_meta_data ->> 'given_name',
        app_user.raw_user_meta_data ->> 'family_name'
      )), ''),
      ''
    )
  into current_email, current_name
  from auth.users as app_user
  where app_user.id = current_user_id;

  if current_email is null or current_email = '' then
    return false;
  end if;

  select id, role into provisional_id, invited_role
  from public.profiles
  where lower(email) = current_email and not has_signed_in
  for update;

  if provisional_id is null then
    delete from public.invites
    where email = current_email
    returning role into invited_role;
    if invited_role is null then
      return false;
    end if;

    insert into public.profiles (id, full_name, email, role, removed_at, has_signed_in)
    values (current_user_id, current_name, current_email, invited_role, null, true)
    on conflict (id) do update
    set full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end,
        email = excluded.email,
        role = excluded.role,
        removed_at = null,
        has_signed_in = true;
  else
    update public.profiles
    set id = current_user_id,
        full_name = case when full_name = '' then current_name else full_name end,
        role = invited_role,
        removed_at = null,
        has_signed_in = true
    where id = provisional_id;
    delete from public.invites where email = current_email;
  end if;

  return true;
end;
$$;

-- A pending member may not have a name yet, so keep the balance readable by
-- using their invited email until Google supplies their profile name.
create or replace function public.enforce_receivable_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member_name_value text;
begin
  if TG_OP = 'INSERT' or new.member_id is distinct from old.member_id then
    select coalesce(nullif(trim(full_name), ''), email) into member_name_value
    from public.profiles
    where id = new.member_id and role in ('member', 'admin') and removed_at is null;
    if not found then raise exception 'Choose an active member'; end if;
    new.member_name := member_name_value;
  elsif new.member_name is distinct from old.member_name then
    raise exception 'Change the member account instead of editing its name';
  end if;
  return new;
end;
$$;

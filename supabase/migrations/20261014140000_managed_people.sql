alter table public.profiles
  add column membership text check (membership in ('brother', 'associate_member')),
  add column phone text not null default '',
  add column contact_email text not null default '',
  add column executive_roles text[] not null default '{}',
  add constraint profiles_executive_membership check (
    cardinality(executive_roles) = 0 or membership is not distinct from 'brother'
  ),
  add constraint profiles_executive_roles check (
    executive_roles <@ array['president', 'vice_president', 'treasurer', 'house_manager', 'social_chair', 'education_chair', 'secretary', 'rush_chair']::text[]
    and array_position(executive_roles, null) is null
  );

create unique index profiles_single_president
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['president']::text[];

create unique index profiles_single_vice_president
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['vice_president']::text[];

create unique index profiles_single_treasurer
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['treasurer']::text[];

create unique index profiles_single_house_manager
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['house_manager']::text[];

create unique index profiles_single_social_chair
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['social_chair']::text[];

create unique index profiles_single_education_chair
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['education_chair']::text[];

create unique index profiles_single_secretary
  on public.profiles ((true))
  where removed_at is null and executive_roles @> array['secretary']::text[];

create function public.clear_removed_person_offices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.executive_roles := '{}';
  return new;
end;
$$;

create trigger profiles_clear_removed_offices
  before update of removed_at on public.profiles
  for each row
  when (old.removed_at is null and new.removed_at is not null)
  execute function public.clear_removed_person_offices();

create function public.admin_update_person(
  target_user_id uuid,
  person_name text,
  person_contact_email text,
  person_phone text,
  person_membership text,
  person_executive_roles text[]
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit people';
  end if;
  if person_name is null or char_length(trim(person_name)) not between 1 and 120 then
    raise exception 'Name must have between 1 and 120 characters';
  end if;
  if person_contact_email is null or char_length(person_contact_email) > 254
    or (trim(person_contact_email) <> '' and trim(person_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'Enter a valid contact email';
  end if;
  if person_phone is null or char_length(person_phone) > 50 then
    raise exception 'Phone must have at most 50 characters';
  end if;

  update public.profiles
  set full_name = trim(person_name),
      contact_email = lower(trim(person_contact_email)),
      phone = trim(person_phone),
      membership = person_membership,
      executive_roles = person_executive_roles
  where id = target_user_id and removed_at is null;

  if not found then
    raise exception 'Person not found';
  end if;
end;
$$;

revoke all on function public.admin_update_person(uuid, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.admin_update_person(uuid, text, text, text, text, text[]) to authenticated;

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
        full_name = case when full_name = '' then resolved_name else full_name end,
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

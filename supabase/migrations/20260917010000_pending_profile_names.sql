create function public.admin_set_pending_profile_name(target_user_id uuid, new_full_name text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_name text := trim(new_full_name);
begin
  if not public.is_admin() then
    raise exception 'only admins can change pending user names';
  end if;
  if normalized_name is null or normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'name must have between 1 and 120 characters';
  end if;

  update public.profiles
  set full_name = normalized_name
  where id = target_user_id and not has_signed_in and removed_at is null;

  if not found then
    raise exception 'pending user not found';
  end if;
end;
$$;

revoke all on function public.admin_set_pending_profile_name(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_pending_profile_name(uuid, text) to authenticated;

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
    set full_name = excluded.full_name,
        email = excluded.email,
        role = excluded.role,
        removed_at = null,
        has_signed_in = true;
  else
    update public.profiles
    set id = current_user_id,
        full_name = current_name,
        role = invited_role,
        removed_at = null,
        has_signed_in = true
    where id = provisional_id;
    delete from public.invites where email = current_email;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_pending_invite() from public, anon, authenticated;
grant execute on function public.claim_pending_invite() to authenticated;

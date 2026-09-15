-- A Supabase auth user can exist without a profiles row if they were removed
-- before profile deletion became a soft delete. Inviting that email stores an
-- invite, but signing in again does not re-run the auth.users INSERT trigger.
-- Let an authenticated user consume only the invite matching the verified
-- email on their own auth.users row and recreate/restore their profile.

create or replace function public.claim_pending_invite()
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_name text;
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

  delete from public.invites
  where email = current_email
  returning role into invited_role;

  if invited_role is null then
    return false;
  end if;

  insert into public.profiles (id, full_name, email, role, removed_at)
  values (current_user_id, current_name, current_email, invited_role, null)
  on conflict (id) do update
  set email = excluded.email,
      role = excluded.role,
      removed_at = null;

  return true;
end;
$$;

revoke all on function public.claim_pending_invite() from public, anon, authenticated;
grant execute on function public.claim_pending_invite() to authenticated;

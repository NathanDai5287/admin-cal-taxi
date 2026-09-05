-- Let admins remove users without losing their reimbursement history, and
-- backfill full names from Google metadata.

-- Removing a profile must not cascade-delete the person's reimbursements.
-- Detach them instead: the reimbursement row keeps its own full_name snapshot.
alter table public.reimbursements
  drop constraint reimbursements_user_id_fkey;
alter table public.reimbursements
  alter column user_id drop not null;
alter table public.reimbursements
  add constraint reimbursements_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- Admins can remove a user. The auth.users row stays (only Supabase's admin
-- API can delete it), but with no profile they get the synthesized 'none'
-- role if they ever sign in again, and their reimbursements are preserved.
create or replace function public.admin_remove_profile(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can remove users';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;
  delete from public.profiles where id = target_user_id;
end;
$$;

revoke all on function public.admin_remove_profile(uuid) from anon, authenticated;
grant execute on function public.admin_remove_profile(uuid) to authenticated;

-- Google does not always send a 'full_name' claim; some tokens only carry
-- 'name' or split 'given_name'/'family_name'. Prefer the fullest available.
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
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(concat_ws(' ',
        new.raw_user_meta_data ->> 'given_name',
        new.raw_user_meta_data ->> 'family_name')), ''),
      ''
    ),
    coalesce(new.email, ''),
    coalesce(invite_role, 'none')
  );
  return new;
end;
$$;

-- Backfill existing profiles whose stored name is empty or a single word
-- (first name only) when Google has a fuller name on file. Names the user
-- edited themselves that already contain a space are left untouched.
update public.profiles as profile
set full_name = candidate.full_name
from (
  select
    id,
    coalesce(
      nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(raw_user_meta_data ->> 'name'), ''),
      nullif(trim(concat_ws(' ',
        raw_user_meta_data ->> 'given_name',
        raw_user_meta_data ->> 'family_name')), ''),
      ''
    ) as full_name
  from auth.users
) as candidate
where candidate.id = profile.id
  and candidate.full_name <> ''
  and candidate.full_name <> profile.full_name
  and (
    profile.full_name = ''
    or position(' ' in trim(profile.full_name)) = 0
  );

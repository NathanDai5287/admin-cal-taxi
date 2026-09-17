alter table public.profiles
  add column discord_user_id text not null default ''
  check (discord_user_id = '' or discord_user_id ~ '^[0-9]{15,22}$');

update public.profiles as profile
set discord_user_id = (
  select receivable.discord_user_id
  from public.chapter_receivables as receivable
  where receivable.member_id = profile.id
    and receivable.discord_user_id ~ '^[0-9]{15,22}$'
  order by receivable.updated_at desc, receivable.id desc
  limit 1
)
where exists (
  select 1
  from public.chapter_receivables as receivable
  where receivable.member_id = profile.id
    and receivable.discord_user_id ~ '^[0-9]{15,22}$'
);

create function public.admin_set_profile_discord_id(target_user_id uuid, new_discord_user_id text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_id text := trim(new_discord_user_id);
begin
  if not public.is_admin() then
    raise exception 'only admins can change Discord IDs';
  end if;
  if normalized_id <> '' and normalized_id !~ '^[0-9]{15,22}$' then
    raise exception 'Discord ID must contain 15 to 22 digits';
  end if;

  update public.profiles
  set discord_user_id = normalized_id
  where id = target_user_id and removed_at is null;

  if not found then
    raise exception 'member not found';
  end if;

  update public.chapter_receivables
  set discord_user_id = normalized_id
  where member_id = target_user_id;
end;
$$;

revoke all on function public.admin_set_profile_discord_id(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_profile_discord_id(uuid, text) to authenticated;

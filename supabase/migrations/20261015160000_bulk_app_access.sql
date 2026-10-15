create function public.admin_set_app_access(app_key text, access_level text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_app_access('roles', 'write') then
    raise exception 'Write access to Roles is required' using errcode = '42501';
  end if;
  if access_level is null or access_level not in ('none', 'read', 'write') then
    raise exception 'Choose a valid access level';
  end if;
  update public.role_app_access permission
  set access_level = admin_set_app_access.access_level
  where permission.app_key = admin_set_app_access.app_key
    and permission.role_key <> 'admin';
  if not found then
    raise exception 'Unknown app';
  end if;
end;
$$;

revoke all on function public.admin_set_app_access(text, text) from public, anon;
grant execute on function public.admin_set_app_access(text, text) to authenticated;

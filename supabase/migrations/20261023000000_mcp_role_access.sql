create function public.mcp_list_role_access()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_mcp_app_access('roles', 'read') then
    raise exception 'Read access to Roles is required' using errcode = '42501';
  end if;
  return jsonb_build_object('permissions', coalesce((
    select jsonb_agg(jsonb_build_object('role', role_key, 'app', app_key, 'access', access_level) order by role_key, app_key)
    from public.role_app_access
  ), '[]'::jsonb), 'people', case when public.has_mcp_app_access('users', 'read') then coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'membership', membership, 'executiveRoles', executive_roles) order by full_name)
    from public.profiles where removed_at is null
  ), '[]'::jsonb) end);
end;
$$;

create function public.mcp_set_role_access(p_role text, p_app text, p_access text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_mcp_app_access('roles', 'write') then
    raise exception 'Write access to Roles is required' using errcode = '42501';
  end if;
  if p_role = 'admin' then
    raise exception 'Administrator access cannot change' using errcode = '42501';
  end if;
  update public.role_app_access set access_level = p_access
  where (p_role is null and role_key <> 'admin' or role_key = p_role) and app_key = p_app;
  if not found then raise exception 'Unknown role or app' using errcode = 'P0002'; end if;
  insert into public.mcp_audit_log (user_id, client_id, tool_name, target_id, details)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'set_role_access', p_app,
    jsonb_build_object('role', coalesce(p_role, 'all'), 'app', p_app, 'access', p_access));
  return jsonb_build_object('role', coalesce(p_role, 'all'), 'app', p_app, 'access', p_access);
end;
$$;

create function public.mcp_set_person_roles(p_user_id uuid, p_membership text, p_executive_roles text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_mcp_app_access('users', 'write') then
    raise exception 'Write access to Users is required' using errcode = '42501';
  end if;
  update public.profiles set membership = p_membership, executive_roles = p_executive_roles
  where id = p_user_id and removed_at is null;
  if not found then raise exception 'The member was not found' using errcode = 'P0002'; end if;
  insert into public.mcp_audit_log (user_id, client_id, tool_name, target_id, details)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'set_person_roles', p_user_id::text,
    jsonb_build_object('membership', p_membership, 'executiveRoles', p_executive_roles));
  return jsonb_build_object('id', p_user_id, 'membership', p_membership, 'executiveRoles', p_executive_roles);
end;
$$;

revoke all on function public.mcp_list_role_access() from public, anon;
revoke all on function public.mcp_set_role_access(text, text, text) from public, anon;
revoke all on function public.mcp_set_person_roles(uuid, text, text[]) from public, anon;
grant execute on function public.mcp_list_role_access() to authenticated;
grant execute on function public.mcp_set_role_access(text, text, text) to authenticated;
grant execute on function public.mcp_set_person_roles(uuid, text, text[]) to authenticated;

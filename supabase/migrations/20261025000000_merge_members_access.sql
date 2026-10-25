update public.role_app_access people
set access_level = roles.access_level
from public.role_app_access roles
where roles.role_key = people.role_key
  and people.app_key = 'users' and roles.app_key = 'roles'
  and (roles.access_level = 'write' or (roles.access_level = 'read' and people.access_level = 'none'));

delete from public.role_app_access where app_key = 'roles';

alter table public.role_app_access drop constraint role_app_access_app_key_check;
alter table public.role_app_access add constraint role_app_access_app_key_check check (app_key in (
  'host', 'rush', 'finance', 'accreditation', 'ask-policy', 'nu-news',
  'mailing-list', 'users', 'connections', 'policy', 'submit'
));

alter policy role_permissions_read on public.role_app_access using (public.has_app_access('users'));

do $$
declare routine record;
begin
  for routine in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_set_role_app_access', 'admin_set_app_access', 'mcp_list_role_access', 'mcp_set_role_access')
  loop
    execute replace(replace(pg_get_functiondef(routine.oid), '''roles''', '''users'''), 'access to Roles', 'access to Members');
  end loop;
end;
$$;

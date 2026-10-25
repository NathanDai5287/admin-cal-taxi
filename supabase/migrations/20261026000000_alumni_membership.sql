alter table public.profiles drop constraint profiles_membership_check;
alter table public.profiles add constraint profiles_membership_check check (membership in ('brother', 'associate_member', 'alumni'));

alter table public.role_app_access drop constraint role_app_access_role_key_check;
alter table public.role_app_access add constraint role_app_access_role_key_check check (role_key in (
  'admin', 'member', 'brother', 'associate_member', 'alumni', 'exec_member',
  'president', 'vice_president', 'treasurer', 'house_manager',
  'social_chair', 'education_chair', 'secretary', 'rush_chair'
));

insert into public.role_app_access (role_key, app_key, access_level)
select 'alumni', app_key, case when app_key = 'submit' then 'write' else 'none' end
from public.role_app_access
where role_key = 'member';

do $$
declare routine record;
begin
  for routine in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'view_as_roles'
  loop
    execute replace(pg_get_functiondef(routine.oid), '''associate_member'')', '''associate_member'', ''alumni'')');
  end loop;
end;
$$;

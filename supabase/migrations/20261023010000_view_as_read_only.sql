create function public.view_as_roles()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select case
    when header.role in ('member', 'brother', 'associate_member') then array[header.role, 'member']
    when header.role = 'exec_member' then array['exec_member', 'brother', 'member']
    when header.role in (select role_key from public.role_app_access where role_key <> 'admin') then array[header.role, 'exec_member', 'brother', 'member']
    else '{}'::text[]
  end
  from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-view-as-role' as role) header
  where header.role is not null
    and coalesce(auth.jwt() ->> 'client_id', '') = ''
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and removed_at is null)
$$;

create function public.block_view_as_writes()
returns void
language plpgsql set search_path = ''
as $$
begin
  if nullif(current_setting('request.headers', true), '')::json ->> 'x-view-as-role' is not null then
    set local transaction_read_only = on;
  end if;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') = '' and public.view_as_roles() is null and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and removed_at is null
  )
$$;

create or replace function public.get_my_app_access()
returns table (app_key text, access_level text)
language sql stable security definer set search_path = ''
as $$
  select permission.app_key,
    case max(case permission.access_level when 'write' then 2 when 'read' then 1 else 0 end)
      when 2 then 'write' when 1 then 'read' else 'none' end
  from public.role_app_access permission
  join public.profiles person on person.id = auth.uid()
    and person.removed_at is null
    and coalesce(auth.jwt() ->> 'client_id', '') = ''
    and case when public.view_as_roles() is null then
      permission.role_key = person.role::text
      or permission.role_key = person.membership
      or permission.role_key = any(person.executive_roles)
      or (permission.role_key = 'exec_member' and cardinality(person.executive_roles) > 0)
    else permission.role_key = any(public.view_as_roles()) end
  group by permission.app_key
$$;

revoke all on function public.view_as_roles() from public, anon;
revoke all on function public.block_view_as_writes() from public, anon;
grant execute on function public.view_as_roles() to authenticated, service_role;
grant execute on function public.block_view_as_writes() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.block_view_as_writes';
notify pgrst, 'reload config';

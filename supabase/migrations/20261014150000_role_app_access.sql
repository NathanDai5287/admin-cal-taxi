create table public.role_app_access (
  role_key text not null check (role_key in (
    'admin', 'member', 'brother', 'associate_member', 'exec_member',
    'president', 'vice_president', 'treasurer', 'house_manager',
    'social_chair', 'education_chair', 'secretary', 'rush_chair'
  )),
  app_key text not null check (app_key in (
    'host', 'rush', 'finance', 'accreditation', 'ask-policy', 'nu-news',
    'mailing-list', 'users', 'roles', 'connections', 'policy', 'submit'
  )),
  access_level text not null check (access_level in ('none', 'read', 'write')),
  primary key (role_key, app_key),
  check (role_key <> 'admin' or access_level = 'write')
);

insert into public.role_app_access (role_key, app_key, access_level)
select role_key, app_key,
  case when role_key = 'admin' or (role_key = 'member' and app_key = 'submit') then 'write' else 'none' end
from unnest(array[
  'admin', 'member', 'brother', 'associate_member', 'exec_member',
  'president', 'vice_president', 'treasurer', 'house_manager',
  'social_chair', 'education_chair', 'secretary', 'rush_chair'
]) as role_key
cross join unnest(array[
  'host', 'rush', 'finance', 'accreditation', 'ask-policy', 'nu-news',
  'mailing-list', 'users', 'roles', 'connections', 'policy', 'submit'
]) as app_key;

create function public.get_my_app_access()
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
    and (permission.role_key = person.role::text
      or permission.role_key = person.membership
      or permission.role_key = any(person.executive_roles)
      or (permission.role_key = 'exec_member' and cardinality(person.executive_roles) > 0))
  group by permission.app_key
$$;

create function public.has_app_access(app_key text, required_access text default 'read')
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.get_my_app_access() permission
    where permission.app_key = has_app_access.app_key
      and required_access in ('read', 'write')
      and (permission.access_level = 'write' or (required_access = 'read' and permission.access_level = 'read'))
  )
$$;

revoke all on public.role_app_access from public, anon, authenticated;
grant select on public.role_app_access to authenticated;
grant all on public.role_app_access to service_role;
alter table public.role_app_access enable row level security;
create policy role_permissions_read on public.role_app_access for select to authenticated
  using (public.has_app_access('roles'));

create function public.admin_set_role_app_access(role_key text, app_key text, access_level text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_app_access('roles', 'write') then
    raise exception 'Write access to Roles is required' using errcode = '42501';
  end if;
  if role_key = 'admin' then
    raise exception 'Administrator access cannot change' using errcode = '42501';
  end if;
  update public.role_app_access permission
  set access_level = admin_set_role_app_access.access_level
  where permission.role_key = admin_set_role_app_access.role_key
    and permission.app_key = admin_set_role_app_access.app_key;
  if not found then
    raise exception 'Unknown role or app';
  end if;
end;
$$;

revoke all on function public.get_my_app_access() from public, anon;
revoke all on function public.has_app_access(text, text) from public, anon;
revoke all on function public.admin_set_role_app_access(text, text, text) from public, anon;
grant execute on function public.get_my_app_access() to authenticated, service_role;
grant execute on function public.has_app_access(text, text) to authenticated, service_role;
grant execute on function public.admin_set_role_app_access(text, text, text) to authenticated;

create or replace function public.is_policy_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_app_access('policy'); $$;

do $$
declare
  existing_policy record;
  app text;
  read_rule text;
  write_rule text;
  check_rule text;
begin
  for existing_policy in select * from pg_policies
    where schemaname in ('public', 'storage') and (qual like '%is_admin()%' or with_check like '%is_admin()%')
  loop
    app := case
      when existing_policy.tablename = 'profiles' then 'users'
      when existing_policy.tablename = 'invites' then null
      when existing_policy.tablename = 'mcp_audit_log' then 'connections'
      when existing_policy.tablename = 'venue_inquiries' then 'host'
      when existing_policy.tablename like 'accreditation_ask_%' then 'ask-policy'
      when existing_policy.tablename like 'accreditation_%' then 'accreditation'
      when existing_policy.tablename in ('academic_years', 'academic_terms') then 'accreditation'
      when existing_policy.tablename like 'policy_%' then 'policy'
      when existing_policy.tablename like 'nu_news_%' then 'nu-news'
      when existing_policy.tablename = 'mailing_list_contacts' then 'mailing-list'
      when existing_policy.tablename like 'reimbursement%' or existing_policy.tablename like 'chapter_%'
        or existing_policy.tablename like 'hosting_finance_%' or existing_policy.tablename = 'dues_payment_events' then 'finance'
      when existing_policy.schemaname = 'storage' and existing_policy.policyname like '%nu news%' then 'nu-news'
      when existing_policy.schemaname = 'storage' and existing_policy.policyname like '%accreditation%' then 'accreditation'
      when existing_policy.schemaname = 'storage' and existing_policy.policyname like '%policy%' then 'policy'
      when existing_policy.schemaname = 'storage' and existing_policy.policyname like '%receipts%' then 'finance'
    end;
    if app is null then continue; end if;
    read_rule := replace(existing_policy.qual, 'is_admin()', format('has_app_access(%L, %L)', app, 'read'));
    write_rule := replace(existing_policy.qual, 'is_admin()', format('has_app_access(%L, %L)', app, 'write'));
    check_rule := replace(existing_policy.with_check, 'is_admin()', format('has_app_access(%L, %L)', app, 'write'));
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
    if existing_policy.cmd = 'ALL' then
      execute format('create policy %I on %I.%I for select to authenticated using (%s)',
        existing_policy.policyname || ' read', existing_policy.schemaname, existing_policy.tablename, read_rule);
      execute format('create policy %I on %I.%I for all to authenticated using (%s) with check (%s)',
        existing_policy.policyname || ' write', existing_policy.schemaname, existing_policy.tablename, write_rule, check_rule);
      continue;
    end if;
    execute format('create policy %I on %I.%I for %s to authenticated%s%s',
      existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename, existing_policy.cmd,
      case when existing_policy.qual is null then '' else ' using (' || case when existing_policy.cmd = 'SELECT' then read_rule else write_rule end || ')' end,
      case when check_rule is null then '' else ' with check (' || check_rule || ')' end);
  end loop;
end;
$$;

create policy finance_people_read on public.profiles for select to authenticated
  using (public.has_app_access('finance') or public.has_app_access('host'));

create policy shared_academic_years_read on public.academic_years for select to authenticated
  using (public.has_app_access('finance') or public.has_app_access('users'));
create policy shared_academic_terms_read on public.academic_terms for select to authenticated
  using (public.has_app_access('finance') or public.has_app_access('users'));

create policy receipt_app_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'receipts' or public.has_app_access('submit', 'write'));

do $$
declare
  routine record;
  app text;
  required_access text;
begin
  for routine in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%public.is_admin()%'
  loop
    app := case
      when routine.proname in ('admin_update_person', 'admin_set_pending_profile_name', 'admin_set_profile_discord_id', 'admin_set_profile_academic_term') then 'users'
      when routine.proname in ('record_dues_payment', 'set_dues_paid_state', 'bulk_update_receivables', 'bulk_change_receivable_state',
        'set_receivable_payment_plan', 'add_receivable_note', 'manage_receivable_note', 'record_hosting_payment') then 'finance'
      when routine.proname in ('search_report_evidence', 'search_template_drafting_context') then 'accreditation'
      when routine.proname in ('search_policy_and_accreditation_chunks', 'save_accreditation_ask_turn') then 'ask-policy'
    end;
    if app is null then continue; end if;
    required_access := case when routine.proname like 'search_%' then 'read' else 'write' end;
    execute replace(pg_get_functiondef(routine.oid), 'public.is_admin()', format('public.has_app_access(%L, %L)', app, required_access));
  end loop;
end;
$$;
create function public.has_mcp_app_access(app_key text, required_access text default 'read')
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles person
    join public.role_app_access permission on
      permission.role_key = person.role::text
      or permission.role_key = person.membership
      or permission.role_key = any(person.executive_roles)
      or (permission.role_key = 'exec_member' and cardinality(person.executive_roles) > 0)
    where person.id = auth.uid() and person.removed_at is null
      and coalesce(auth.jwt() ->> 'client_id', '') <> ''
      and permission.app_key = has_mcp_app_access.app_key
      and required_access in ('read', 'write')
      and (permission.access_level = 'write' or (required_access = 'read' and permission.access_level = 'read'))
  )
$$;
revoke all on function public.has_mcp_app_access(text, text) from public, anon;
grant execute on function public.has_mcp_app_access(text, text) to authenticated, service_role;

do $$
declare
  routine record;
  permission_check text;
begin
  for routine in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'mcp_%' and p.prosrc like '%public.is_mcp_admin()%'
  loop
    permission_check := case routine.proname
      when 'mcp_admin_read' then $check$public.has_mcp_app_access(case when p_resource = 'members' then 'users' else 'finance' end, 'read')$check$
      when 'mcp_admin_write' then $check$(public.has_mcp_app_access(case when p_action in ('invite_user', 'set_user_role', 'set_pending_user_name', 'set_discord_user_id', 'remove_user') then 'users' else 'finance' end, 'write') and (p_action not in ('invite_user', 'set_user_role', 'remove_user') or public.is_mcp_admin()
        or (coalesce(p_payload ->> 'role', 'member') <> 'admin' and not exists (
          select 1 from public.profiles target where target.role = 'admin'
            and (target.id::text = p_payload ->> 'userId' or lower(target.email) = lower(trim(p_payload ->> 'email')))
        ))))$check$
      when 'mcp_begin_external' then $check$(
        public.has_mcp_app_access(case when p_action = 'send_invite_email' then 'users' else 'finance' end, 'write')
        and (p_action <> 'send_invite_email' or public.is_mcp_admin()
          or (coalesce(p_payload ->> 'role', 'member') <> 'admin' and not exists (
            select 1 from public.profiles target where target.role = 'admin'
              and lower(target.email) = lower(trim(p_payload ->> 'email'))
          )))
      )$check$
      when 'mcp_finish_external' then $check$public.has_mcp_app_access((select case when saved.tool_name = 'send_invite_email' then 'users' else 'finance' end from public.mcp_external_requests saved where saved.user_id = auth.uid() and saved.client_id = client and saved.request_id = p_request_id), 'write')$check$
      when 'mcp_create_reimbursement' then $check$public.has_mcp_app_access('finance', 'write')$check$
      when 'mcp_finance_overview' then $check$public.has_mcp_app_access('finance', 'read')$check$
      when 'mcp_budget_categories' then $check$public.has_mcp_app_access('finance', 'read')$check$
      when 'mcp_open_dues' then $check$public.has_mcp_app_access('finance', 'read')$check$
    end;
    if permission_check is null then continue; end if;
    execute replace(pg_get_functiondef(routine.oid), 'public.is_mcp_admin()', permission_check);
  end loop;
end;
$$;

drop policy "active members can view their reimbursements and admins can view all" on public.reimbursements;
create policy reimbursement_app_read on public.reimbursements for select to authenticated
  using (public.has_app_access('finance') or (user_id = auth.uid() and public.has_app_access('submit')));

drop policy "members can submit reimbursements for themselves" on public.reimbursements;
create policy reimbursement_own_submission on public.reimbursements for insert to authenticated
  with check (
    public.has_app_access('submit', 'write') and user_id = auth.uid() and status = 'pending'
    and merchant is null and receipt_date is null and receipt_total is null
    and failure_reason is null and denial_reason is null
  );

drop policy "active members can read their receipts and admins can read all" on storage.objects;
create policy receipt_app_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (public.has_app_access('finance')
    or ((storage.foldername(name))[1] = auth.uid()::text and public.has_app_access('submit'))));
do $$
declare
  routine record;
  permission_check text;
begin
  for routine in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_invite_email', 'admin_set_profile_role', 'admin_remove_profile')
  loop
    permission_check := case routine.proname
      when 'admin_invite_email' then $check$(
        public.has_app_access('users', 'write') and (public.is_admin()
          or (invite_role = 'member' and not exists (
            select 1 from public.profiles where lower(email) = lower(trim(invite_email)) and role = 'admin'
          )))
      )$check$
      when 'admin_set_profile_role' then $check$(
        public.has_app_access('users', 'write') and (public.is_admin()
          or (new_role = 'member' and not exists (
            select 1 from public.profiles where id = target_user_id and role = 'admin'
          )))
      )$check$
      when 'admin_remove_profile' then $check$(
        public.has_app_access('users', 'write') and (public.is_admin() or not exists (
          select 1 from public.profiles where id = target_user_id and role = 'admin'
        ))
      )$check$
    end;
    execute replace(pg_get_functiondef(routine.oid), 'public.is_admin()', permission_check);
  end loop;
end;
$$;

create policy users_invites_read on public.invites for select to authenticated
  using (public.has_app_access('users'));

create policy ask_evidence_read on public.accreditation_sources for select to authenticated
  using (public.has_app_access('ask-policy'));
create policy ask_evidence_chunks_read on public.accreditation_source_chunks for select to authenticated
  using (public.has_app_access('ask-policy'));
create policy ask_policy_documents_read on public.policy_documents for select to authenticated
  using (public.has_app_access('ask-policy') and status = 'published' and processing_state = 'ready');
create policy ask_evidence_storage_read on storage.objects for select to authenticated
  using (public.has_app_access('ask-policy') and bucket_id = 'accreditation-sources');

do $$
declare routine_definition text;
begin
  select pg_get_functiondef('public.approve_accreditation_revision(uuid, uuid, uuid)'::regprocedure) into routine_definition;
  routine_definition := replace(routine_definition, 'public.is_admin()', 'public.has_app_access(''accreditation'', ''write'')');
  routine_definition := replace(routine_definition, 'role = ''admin''', $check$(role = 'admin' or exists (
    select 1 from public.role_app_access permission
    where permission.app_key = 'accreditation' and permission.access_level = 'write'
      and (permission.role_key = profiles.role::text or permission.role_key = profiles.membership
        or permission.role_key = any(profiles.executive_roles)
        or (permission.role_key = 'exec_member' and cardinality(profiles.executive_roles) > 0))
  ))$check$);
  execute routine_definition;
end;
$$;
alter policy "members can update their own name" on public.profiles
  using (id = auth.uid() and public.has_app_access('users', 'write'))
  with check (id = auth.uid() and public.has_app_access('users', 'write'));
do $$
declare routine_definition text;
begin
  select pg_get_functiondef('public.reserve_policy_question(uuid, text, date, integer, integer)'::regprocedure) into routine_definition;
  routine_definition := replace(routine_definition, 'role in (''member'',''admin'')', $check$exists (
    select 1 from public.role_app_access permission
    where permission.app_key = 'policy' and permission.access_level = 'write'
      and (permission.role_key = profiles.role::text or permission.role_key = profiles.membership
        or permission.role_key = any(profiles.executive_roles)
        or (permission.role_key = 'exec_member' and cardinality(profiles.executive_roles) > 0))
  )$check$);
  execute routine_definition;
end;
$$;

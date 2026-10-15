update public.role_app_access
set access_level = case
  when role_key = 'admin' then 'write'
  when app_key = 'submit' and role_key in ('brother', 'associate_member') then 'write'
  when app_key = 'finance' and role_key = 'treasurer' then 'write'
  else 'none'
end
where app_key in ('submit', 'finance');

alter policy "admins can change reimbursement status" on public.reimbursements
  using (public.is_admin() and public.has_app_access('finance', 'write'))
  with check (public.is_admin() and public.has_app_access('finance', 'write'));

create policy reimbursement_admin_delete on public.reimbursements as restrictive for delete to authenticated
  using (public.is_admin());

do $$
declare
  routine_definition text;
begin
  select pg_get_functiondef('public.mcp_create_reimbursement(uuid, public.reimbursement_category, numeric, text, text, text, boolean, uuid)'::regprocedure)
    into routine_definition;
  execute replace(routine_definition, 'public.has_mcp_app_access(''finance'', ''write'')', 'public.is_mcp_admin()');

  select pg_get_functiondef('public.mcp_admin_write(text, jsonb, uuid, boolean)'::regprocedure)
    into routine_definition;
  execute replace(routine_definition, E'begin\n', E'begin\n  if p_action = ''update_reimbursement'' and not public.is_mcp_admin() then\n    raise exception ''Only administrators can change reimbursements'' using errcode = ''42501'';\n  end if;\n');
end;
$$;

create function public.require_discord_reimbursement_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.discord_decided_at is not distinct from old.discord_decided_at
    and new.discord_reviewer_id is not distinct from old.discord_reviewer_id then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles
    where discord_user_id = new.discord_reviewer_id and role = 'admin' and removed_at is null
  ) then
    raise exception 'Only administrators can review reimbursements through Discord' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.require_discord_reimbursement_admin() from public, anon, authenticated;
create trigger reimbursements_discord_admin
before update of discord_decided_at, discord_reviewer_id on public.reimbursements
for each row execute function public.require_discord_reimbursement_admin();

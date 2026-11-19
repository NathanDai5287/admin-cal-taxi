alter table public.accreditation_template_families add column checklist_report_key text;

create unique index accreditation_one_active_family_per_checklist_report
  on public.accreditation_template_families (checklist_report_key)
  where checklist_report_key is not null and archived_at is null;

create function public.activate_accreditation_uploaded_template(p_family_id uuid, p_template_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  target_version integer;
begin
  perform 1 from public.accreditation_template_families
    where id = p_family_id and archived_at is null for update;
  if not found then return false; end if;

  select version into target_version from public.accreditation_templates
    where id = p_template_id and template_family_id = p_family_id;
  if not found then return false; end if;

  if exists (select 1 from public.accreditation_templates
    where template_family_id = p_family_id and is_active and version > target_version) then
    return false;
  end if;

  update public.accreditation_templates set is_active = false
    where template_family_id = p_family_id and is_active and id <> p_template_id;
  update public.accreditation_templates set is_active = true, analysis_status = 'active'
    where id = p_template_id;
  return true;
end;
$$;

revoke all on function public.activate_accreditation_uploaded_template(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_accreditation_uploaded_template(uuid, uuid) to service_role;

create function public.guard_checklist_template_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.accreditation_revisions r
      join public.accreditation_template_families f on f.id = new.template_family_id
    where r.id = new.approved_revision_id and r.provider_config ->> 'mode' = 'dynamic_template'
      and f.checklist_report_key is not null
  ) and not exists (
    select 1 from public.accreditation_revisions r
      join public.accreditation_run_working_state s on s.run_id = r.run_id
    where r.id = new.approved_revision_id and r.run_id = new.id and r.draft = s.draft
      and r.revision_number = (select max(revision_number) from public.accreditation_revisions where run_id = new.id)
  ) then
    raise exception 'Generate and review the latest form before approving';
  end if;
  return new;
end;
$$;

create trigger guard_checklist_template_approval before update of status on public.accreditation_runs
  for each row when (new.status = 'approved') execute function public.guard_checklist_template_approval();

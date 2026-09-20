-- Replace the fixed report catalog with reusable, user-named template families.
-- Legacy report_key values remain nullable so historical rows and existing
-- evidence integrations continue to work while new submissions use families.

create table if not exists public.accreditation_template_families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text not null default '',
  guidance text not null default '' check (char_length(guidance) <= 5000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists accreditation_template_families_name_idx
  on public.accreditation_template_families (lower(name)) where archived_at is null;
alter table public.accreditation_template_families
  add column if not exists guidance text not null default '';

alter table public.accreditation_templates
  add column if not exists template_family_id uuid references public.accreditation_template_families(id) on delete restrict;
alter table public.accreditation_runs
  add column if not exists template_family_id uuid references public.accreditation_template_families(id) on delete restrict;
alter table public.accreditation_runs
  add column if not exists template_id uuid references public.accreditation_templates(id) on delete restrict;
alter table public.accreditation_sources
  add column if not exists template_family_id uuid references public.accreditation_template_families(id) on delete set null;

alter table public.accreditation_templates alter column report_key drop not null;
alter table public.accreditation_runs alter column report_key drop not null;

do $$
declare
  legacy record;
  family_id uuid;
begin
  for legacy in select report_key::text as report_key, name, description from public.accreditation_report_definitions loop
    select id into family_id
    from public.accreditation_template_families
    where name = legacy.name and archived_at is null
    limit 1;

    if family_id is null then
      insert into public.accreditation_template_families (name, description)
      values (legacy.name, legacy.description)
      returning id into family_id;
    end if;

    update public.accreditation_templates
    set template_family_id = family_id
    where template_family_id is null and report_key::text = legacy.report_key;

    update public.accreditation_runs
    set template_family_id = family_id
    where template_family_id is null and report_key::text = legacy.report_key;

    update public.accreditation_sources
    set template_family_id = family_id
    where template_family_id is null and report_key::text = legacy.report_key;
  end loop;
end $$;

update public.accreditation_runs r
set template_id = t.id
from public.accreditation_templates t
where r.template_id is null
  and t.template_family_id = r.template_family_id
  and t.is_active;

create unique index if not exists accreditation_templates_one_active_family_idx
  on public.accreditation_templates (template_family_id) where is_active and template_family_id is not null;
create unique index if not exists accreditation_template_versions_family_idx
  on public.accreditation_templates (template_family_id, version) where template_family_id is not null;
create unique index if not exists accreditation_one_open_family_run_idx
  on public.accreditation_runs (
    template_family_id,
    cycle_id,
    coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status <> 'approved' and template_family_id is not null;

create table if not exists public.accreditation_run_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.accreditation_runs(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(trim(content)) between 1 and 12000),
  field_updates jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists accreditation_run_messages_run_idx
  on public.accreditation_run_messages (run_id, created_at);

create table if not exists public.accreditation_run_working_state (
  run_id uuid primary key references public.accreditation_runs(id) on delete cascade,
  draft jsonb not null default '{"fields":{}}'::jsonb,
  readiness jsonb not null default '{"ready":false,"missing":[]}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'accreditation_template_families', 'accreditation_run_messages', 'accreditation_run_working_state'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      'admins manage ' || replace(table_name, '_', ' '), table_name
    );
  end loop;
end $$;

create or replace function public.guard_accreditation_run_message_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.accreditation_runs
    where id = new.run_id and status = 'approved'
  ) then
    raise exception 'Approved accreditation runs are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_accreditation_run_message_insert on public.accreditation_run_messages;
create trigger guard_accreditation_run_message_insert
  before insert on public.accreditation_run_messages
  for each row execute procedure public.guard_accreditation_run_message_insert();

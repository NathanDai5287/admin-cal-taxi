create extension if not exists vector with schema extensions;

create type public.accreditation_report_key as enum (
  'annual_report',
  'annual_budget',
  'big_brother_contract'
);
create type public.accreditation_source_kind as enum (
  'official_guideline',
  'blank_template',
  'prior_submission',
  'chapter_evidence',
  'app_snapshot'
);
create type public.accreditation_source_status as enum (
  'processing', 'ready', 'failed', 'archived'
);
create type public.accreditation_run_status as enum (
  'collecting', 'drafting', 'needs_input', 'ready_for_review', 'approved'
);
create type public.accreditation_template_format as enum ('pdf', 'docx', 'xlsx');
create type public.accreditation_artifact_kind as enum ('draft', 'approved');

create table public.accreditation_cycles (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(label) between 4 and 40),
  starts_on date not null,
  ends_on date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.accreditation_terms (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.accreditation_cycles(id) on delete cascade,
  season text not null check (season in ('fall', 'spring')),
  label text not null check (char_length(label) between 3 and 60),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  unique (cycle_id, season),
  unique (id, cycle_id),
  check (ends_on >= starts_on)
);

create table public.accreditation_report_definitions (
  report_key public.accreditation_report_key primary key,
  version integer not null default 1 check (version > 0),
  name text not null,
  cadence text not null check (cadence in ('annual', 'term')),
  description text not null,
  custom_guidance text not null default '' check (char_length(custom_guidance) <= 5000),
  required_sources jsonb not null default '[]'::jsonb,
  field_schema jsonb not null,
  validations jsonb not null default '[]'::jsonb,
  output_formats public.accreditation_template_format[] not null,
  updated_at timestamptz not null default now()
);

create table public.accreditation_templates (
  id uuid primary key default gen_random_uuid(),
  report_key public.accreditation_report_key not null references public.accreditation_report_definitions(report_key),
  version integer not null check (version > 0),
  format public.accreditation_template_format not null,
  original_name text not null,
  mime_type text not null,
  storage_path text not null unique,
  sha256 text not null,
  mapping jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_key, version)
);
create unique index accreditation_templates_one_active_idx
  on public.accreditation_templates (report_key) where is_active;

create table public.accreditation_sources (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.accreditation_cycles(id) on delete restrict,
  term_id uuid references public.accreditation_terms(id) on delete restrict,
  report_key public.accreditation_report_key references public.accreditation_report_definitions(report_key),
  kind public.accreditation_source_kind not null,
  status public.accreditation_source_status not null default 'processing',
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sha256 text not null,
  storage_path text not null unique,
  processing_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (cycle_id, sha256)
);
alter table public.accreditation_sources
  add constraint accreditation_sources_term_cycle_fk
  foreign key (term_id, cycle_id) references public.accreditation_terms(id, cycle_id) on delete restrict;

create table public.accreditation_source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.accreditation_sources(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  content text not null check (char_length(content) > 0),
  locator jsonb not null default '{}'::jsonb,
  embedding extensions.vector,
  embedding_provider text,
  embedding_model text,
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  unique (source_id, ordinal)
);
create index accreditation_source_chunks_search_idx
  on public.accreditation_source_chunks using gin (search_vector);

create table public.accreditation_runs (
  id uuid primary key default gen_random_uuid(),
  report_key public.accreditation_report_key not null references public.accreditation_report_definitions(report_key),
  cycle_id uuid not null references public.accreditation_cycles(id) on delete restrict,
  term_id uuid references public.accreditation_terms(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  status public.accreditation_run_status not null default 'collecting',
  approved_revision_id uuid,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  supersedes_run_id uuid references public.accreditation_runs(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accreditation_one_open_run_idx
  on public.accreditation_runs (
    report_key,
    cycle_id,
    coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status <> 'approved';
alter table public.accreditation_runs
  add constraint accreditation_runs_term_cycle_fk
  foreign key (term_id, cycle_id) references public.accreditation_terms(id, cycle_id) on delete restrict;

create table public.accreditation_revisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.accreditation_runs(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  user_instruction text not null default '',
  draft jsonb not null,
  app_snapshot jsonb not null default '{}'::jsonb,
  source_manifest jsonb not null default '[]'::jsonb,
  validation jsonb not null default '[]'::jsonb,
  provider_config jsonb not null default '{}'::jsonb,
  template_id uuid references public.accreditation_templates(id) on delete restrict,
  immutable boolean not null default false,
  reviewed_original_format boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (run_id, revision_number)
);

alter table public.accreditation_runs
  add constraint accreditation_runs_approved_revision_fk
  foreign key (approved_revision_id) references public.accreditation_revisions(id) on delete restrict;

create table public.accreditation_citations (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.accreditation_revisions(id) on delete cascade,
  field_key text not null,
  source_id uuid references public.accreditation_sources(id) on delete restrict,
  provenance text not null check (provenance in ('retrieved', 'app_snapshot', 'user_input')),
  locator jsonb not null default '{}'::jsonb,
  excerpt text not null default '',
  app_record jsonb,
  created_at timestamptz not null default now()
);

create table public.accreditation_artifacts (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.accreditation_revisions(id) on delete restrict,
  kind public.accreditation_artifact_kind not null,
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (revision_id, kind)
);

create trigger accreditation_runs_set_updated_at
  before update on public.accreditation_runs
  for each row execute procedure public.set_updated_at();

create or replace function public.guard_accreditation_immutable()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_table_name = 'accreditation_runs' and old.status = 'approved' then
    raise exception 'Approved accreditation runs are immutable';
  end if;
  if tg_table_name = 'accreditation_revisions' and old.immutable then
    raise exception 'Approved accreditation revisions are immutable';
  end if;
  if tg_table_name = 'accreditation_artifacts' and exists (
    select 1 from public.accreditation_revisions r where r.id = old.revision_id and r.immutable
  ) then
    raise exception 'Approved accreditation artifacts are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_approved_accreditation_runs
  before update or delete on public.accreditation_runs
  for each row execute procedure public.guard_accreditation_immutable();
create trigger guard_approved_accreditation_revisions
  before update or delete on public.accreditation_revisions
  for each row execute procedure public.guard_accreditation_immutable();
create trigger guard_approved_accreditation_artifacts
  before update or delete on public.accreditation_artifacts
  for each row execute procedure public.guard_accreditation_immutable();

create or replace function public.guard_accreditation_revision_children()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare parent_revision_id uuid;
begin
  parent_revision_id := case when tg_op = 'DELETE' then old.revision_id else new.revision_id end;
  if exists (select 1 from public.accreditation_revisions where id = parent_revision_id and immutable) then
    raise exception 'Children of approved accreditation revisions are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_approved_accreditation_citations
  before insert or update or delete on public.accreditation_citations
  for each row execute procedure public.guard_accreditation_revision_children();
create trigger guard_approved_accreditation_artifact_inserts
  before insert on public.accreditation_artifacts
  for each row execute procedure public.guard_accreditation_revision_children();

create or replace function public.approve_accreditation_revision(
  p_run_id uuid,
  p_revision_id uuid,
  p_approved_by uuid
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_approved_by and role = 'admin' and removed_at is null
  ) then
    raise exception 'Only active administrators may approve reports';
  end if;
  if not exists (
    select 1 from public.accreditation_runs
    where id = p_run_id and status = 'ready_for_review'
  ) then
    raise exception 'The report is not ready for review';
  end if;
  if not exists (
    select 1 from public.accreditation_revisions
    where id = p_revision_id and run_id = p_run_id and not immutable
  ) then
    raise exception 'The revision is not approvable';
  end if;
  if exists (
    select 1
    from public.accreditation_revisions r,
      jsonb_array_elements(r.validation) validation
    where r.id = p_revision_id and validation ->> 'level' = 'error'
  ) then
    raise exception 'The revision has validation errors';
  end if;
  if not exists (
    select 1 from public.accreditation_artifacts
    where revision_id = p_revision_id and kind = 'approved'
  ) then
    raise exception 'The approved artifact has not been archived';
  end if;

  update public.accreditation_revisions
  set immutable = true, reviewed_original_format = true
  where id = p_revision_id;

  update public.accreditation_runs
  set status = 'approved', approved_revision_id = p_revision_id,
      approved_by = p_approved_by, approved_at = now()
  where id = p_run_id;
end;
$$;
revoke all on function public.approve_accreditation_revision(uuid, uuid, uuid) from public;
grant execute on function public.approve_accreditation_revision(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.guard_accreditation_source_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.accreditation_citations c
    join public.accreditation_revisions r on r.id = c.revision_id
    where c.source_id = old.id and r.immutable
  ) then
    raise exception 'Sources cited by approved reports cannot be deleted';
  end if;
  return old;
end;
$$;
create trigger guard_cited_accreditation_sources
  before delete on public.accreditation_sources
  for each row execute procedure public.guard_accreditation_source_delete();

insert into public.accreditation_report_definitions
  (report_key, name, cadence, description, required_sources, field_schema, validations, output_formats)
values
  (
    'annual_report', 'Annual Report', 'annual',
    'Evidence-grounded narrative report for the academic year.',
    '["official_guideline", "chapter_evidence"]'::jsonb,
    '{"fields":["executive_summary","chapter_achievements","member_development","community_impact","risk_management","goals_next_year"]}'::jsonb,
    '["Every completed narrative field must cite current evidence."]'::jsonb,
    array['docx','pdf']::public.accreditation_template_format[]
  ),
  (
    'annual_budget', 'Annual Budget', 'annual',
    'Deterministic budget export from a frozen Finance snapshot and officer overrides.',
    '["blank_template"]'::jsonb,
    '{"fields":["chapter_name","academic_year","opening_cash","projected_income","planned_expenses","notes"]}'::jsonb,
    '["Numeric totals come only from Finance or explicit officer input."]'::jsonb,
    array['xlsx','pdf']::public.accreditation_template_format[]
  ),
  (
    'big_brother_contract', 'Big Brother Contract', 'term',
    'Structured mentoring agreement with signature fields intentionally left blank.',
    '["blank_template"]'::jsonb,
    '{"fields":["chapter_name","big_brother_name","little_brother_name","effective_date","mentor_commitments","member_commitments","signature_big_brother","signature_little_brother"]}'::jsonb,
    '["Names and dates must be explicit.","Signature fields must remain blank."]'::jsonb,
    array['docx','pdf']::public.accreditation_template_format[]
  )
on conflict (report_key) do update set
  name = excluded.name,
  cadence = excluded.cadence,
  description = excluded.description,
  required_sources = excluded.required_sources,
  field_schema = excluded.field_schema,
  validations = excluded.validations,
  output_formats = excluded.output_formats,
  version = public.accreditation_report_definitions.version + 1,
  updated_at = now();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'accreditation_cycles', 'accreditation_terms', 'accreditation_report_definitions',
    'accreditation_templates', 'accreditation_sources', 'accreditation_source_chunks',
    'accreditation_runs', 'accreditation_revisions', 'accreditation_citations',
    'accreditation_artifacts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy %L on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      'admins manage ' || replace(table_name, '_', ' '), table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('accreditation-sources', 'accreditation-sources', false, 26214400,
    array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/markdown','text/csv','application/json']),
  ('accreditation-templates', 'accreditation-templates', false, 26214400,
    array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('accreditation-artifacts', 'accreditation-artifacts', false, 52428800,
    array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admins manage accreditation storage"
  on storage.objects for all to authenticated
  using (bucket_id in ('accreditation-sources','accreditation-templates','accreditation-artifacts') and public.is_admin())
  with check (bucket_id in ('accreditation-sources','accreditation-templates','accreditation-artifacts') and public.is_admin());

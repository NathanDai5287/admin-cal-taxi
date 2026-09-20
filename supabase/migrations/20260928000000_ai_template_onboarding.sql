-- AI-first template onboarding metadata. Existing mappings remain readable so
-- approved historical artifacts are not rewritten during rollout.
alter table public.accreditation_templates
  add column if not exists analysis_status text not null default 'legacy' check (analysis_status in ('legacy','analyzing','needs_review','active','failed')),
  add column if not exists analysis jsonb not null default '{}'::jsonb,
  add column if not exists example_storage_path text,
  add column if not exists example_original_name text,
  add column if not exists example_sha256 text,
  add column if not exists preview_storage_path text,
  add column if not exists processing_error text;

update public.accreditation_templates
set analysis_status = case when is_active then 'active' else 'legacy' end
where analysis_status = 'legacy';

create index if not exists accreditation_templates_analysis_status_idx
  on public.accreditation_templates (analysis_status, created_at desc);

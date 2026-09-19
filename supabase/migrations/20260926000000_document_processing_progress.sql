alter table public.policy_documents
  add column processing_total integer not null default 0 check (processing_total >= 0),
  add column processing_completed integer not null default 0 check (processing_completed >= 0),
  add column processing_attempts integer not null default 0 check (processing_attempts >= 0),
  add constraint policy_processing_progress_valid check (processing_completed <= processing_total);

alter table public.accreditation_sources
  add column processing_total integer not null default 0 check (processing_total >= 0),
  add column processing_completed integer not null default 0 check (processing_completed >= 0),
  add column processing_attempts integer not null default 0 check (processing_attempts >= 0),
  add constraint accreditation_processing_progress_valid check (processing_completed <= processing_total);

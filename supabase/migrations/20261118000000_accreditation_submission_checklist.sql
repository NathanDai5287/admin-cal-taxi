create table public.accreditation_submission_checkmarks (
  academic_year text not null,
  report_key text not null,
  submitted boolean not null,
  primary key (academic_year, report_key)
);

alter table public.accreditation_submission_checkmarks enable row level security;
revoke all on public.accreditation_submission_checkmarks from public, anon, authenticated;
grant select, insert, update on public.accreditation_submission_checkmarks to service_role;

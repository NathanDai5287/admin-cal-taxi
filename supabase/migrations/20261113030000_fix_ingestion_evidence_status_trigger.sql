-- The shared trigger handles text policy statuses and enum evidence statuses.
-- Cast the row value to text so PostgreSQL never coerces policy-only literals
-- such as 'published' into accreditation_source_status during evidence updates.
create or replace function public.ingestion_archive_cancel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status::text in ('archived','published','superseded') then
  update public.document_ingestion_jobs set status='cancelled',lease_token=null,lease_until=null
  where (case when tg_table_name='policy_documents' then policy_id=new.id else evidence_id=new.id end)
    and status not in ('complete','cancelled');
 end if;
 return new;
end $$;

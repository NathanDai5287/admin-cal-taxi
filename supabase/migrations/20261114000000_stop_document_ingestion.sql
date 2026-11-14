-- Stop preserves the current generation and all committed checkpoints. Lock the
-- source before the job, matching commit/archive, then fence any in-flight worker.
create function public.ingestion_stop(p_job uuid, p_policy boolean) returns text
language plpgsql security definer set search_path='' as $$
declare j public.document_ingestion_jobs; s text;
begin
 select * into j from public.document_ingestion_jobs where id=p_job
 and (case when p_policy then policy_id is not null else evidence_id is not null end);
 if not found then raise exception 'Job not found'; end if;
 if p_policy then select status into s from public.policy_documents where id=j.policy_id for update;
 else select status::text into s from public.accreditation_sources where id=j.evidence_id for update; end if;
 if s is null then raise exception 'Source unavailable'; end if;
 select * into j from public.document_ingestion_jobs where id=p_job for update;
 if not found then raise exception 'Job not found'; end if;
 -- A completion or archive that won the race stays terminal. Repeated stops
 -- also leave an already paused job untouched.
 if j.status not in ('queued','running','waiting') then return j.status; end if;
 if s in ('archived','published','superseded') then raise exception 'Source unavailable'; end if;
 update public.document_ingestion_jobs set status='paused',lease_token=null,
 lease_until=null,error=null,progress_at=now() where id=p_job;
 return 'paused';
end $$;
revoke all on function public.ingestion_stop(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ingestion_stop(uuid,boolean) to service_role;

create or replace function public.ingestion_status_summary(p_ids uuid[],p_policy boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 with sources as (
 select id,status,processing_completed,processing_total,processing_attempts from public.policy_documents where p_policy and id=any(p_ids)
 union all
 select id,status::text,processing_completed,processing_total,processing_attempts from public.accreditation_sources where not p_policy and id=any(p_ids)
 ), latest as (
 select distinct on (coalesce(policy_id,evidence_id)) * from public.document_ingestion_jobs
 where case when p_policy then policy_id=any(p_ids) else evidence_id=any(p_ids) end
 order by coalesce(policy_id,evidence_id),created_at desc,id desc
 ), page_counts as (
 select job_id,count(*) as n from public.document_ingestion_pages where job_id in(select id from latest) group by job_id
 ), chunk_counts as (
 select job_id,count(*) as n,count(*) filter(where embedding is not null) as completed from public.document_ingestion_chunks where job_id in(select id from latest) group by job_id
 ) select coalesce(jsonb_agg(jsonb_build_object(
 'id',s.id,'status',s.status,'processing_attempts',s.processing_attempts,
 'processing_completed',coalesce(c.completed,s.processing_completed),'processing_total',coalesce(c.n,s.processing_total),
 'pages_completed',coalesce(p.n,0),'pages_total',j.page_count,'ingestion_status',j.status,'active',coalesce(j.status in ('queued','running','waiting'),false),
 'ingestion_job',case when j.id is null then null else jsonb_build_object('id',j.id,'status',j.status,'stage',j.stage,'next_retry_at',j.next_retry_at,'progress_at',j.progress_at) end,
 'ingestion_message',case
 when j.id is null then case when s.status='processing' then 'Uploaded—not queued' else null end
 when j.status='complete' then 'Processing complete'
 when j.status='cancelled' then 'Processing cancelled; saved document retained.'
 when j.status in ('paused','failed') then 'Paused; progress saved. '||coalesce(j.error->>'message','')
 when j.status='waiting' then 'Waiting; progress saved. Retry after '||j.next_retry_at::text
 when j.status='queued' then 'Queued'
 when j.stage='extraction' then 'Reading PDF: '||coalesce(p.n,0)::text||'/'||j.page_count::text||' pages'
 when j.stage='embedding' then 'Creating embeddings: '||coalesce(c.completed,0)::text||'/'||coalesce(c.n,0)::text||' passages'
 else 'Processing: '||j.stage end
 )), '[]'::jsonb) from sources s left join latest j on coalesce(j.policy_id,j.evidence_id)=s.id
 left join page_counts p on p.job_id=j.id left join chunk_counts c on c.job_id=j.id
 where cardinality(p_ids)<=1000;
$$;
revoke all on function public.ingestion_status_summary(uuid[],boolean) from public,anon,authenticated;
grant execute on function public.ingestion_status_summary(uuid[],boolean) to service_role;

create or replace function public.ingestion_enqueue(p_source uuid,p_policy boolean,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.document_ingestion_jobs; s text;
begin
 if p_policy then select status into s from public.policy_documents where id=p_source for update;
 else select status into s from public.accreditation_sources where id=p_source for update; end if;
 if s is null or s in ('archived','published','superseded') then raise exception 'Source unavailable'; end if;
 select * into j from public.document_ingestion_jobs where (case when p_policy then policy_id=p_source else evidence_id=p_source end) and status not in ('complete','cancelled','failed') for update;
 if found then
  if coalesce((p_config->>'force_embeddings')::boolean,false) then raise exception 'Processing is already active; wait for it to finish before regenerating embeddings.'; end if;
  if (j.config-'force_page'-'replace_text'-'force_embeddings')<>(p_config-'force_embeddings') then raise exception 'An existing job uses a different configuration. Cancel it before changing settings.'; end if;
  if j.status='paused' then update public.document_ingestion_jobs set status='queued',failures=0,next_retry_at=now() where id=j.id; end if;
  return j.id;
 end if;
 insert into public.document_ingestion_jobs(policy_id,evidence_id,config) values(case when p_policy then p_source end,case when not p_policy then p_source end,p_config) returning id into j.id;
 return j.id;
end $$;


create or replace function public.ingestion_manage(p_job uuid,p_page integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.document_ingestion_jobs; s text; new_id uuid;
begin
 select * into j from public.document_ingestion_jobs where id=p_job;
 if j.policy_id is not null then select status into s from public.policy_documents where id=j.policy_id for update;
 else select status into s from public.accreditation_sources where id=j.evidence_id for update; end if;
 if s is null or s in ('archived','published','superseded') then raise exception 'Source unavailable'; end if;
 select * into j from public.document_ingestion_jobs where id=p_job for update;
 if p_page is not null and j.status in ('queued','running','waiting') then raise exception 'Processing is active. Wait for it to finish before re-extracting a page.'; end if;
 if p_page is not null then
  if not exists(select 1 from public.document_ingestion_pages where job_id=p_job and page=p_page and method='native-v1') then raise exception 'Choose a page originally extracted as native text'; end if;
  if j.evidence_id is not null and exists(select 1 from public.accreditation_citations c join public.accreditation_revisions r on r.id=c.revision_id where c.source_id=j.evidence_id and r.immutable) then raise exception 'Use a new source for approved report evidence'; end if;
 end if;
 update public.document_ingestion_jobs set status='cancelled',lease_token=null,lease_until=null where id=p_job;
 if p_page is null then return p_job; end if;
 insert into public.document_ingestion_jobs(policy_id,evidence_id,config,page_count,stage)
 values(j.policy_id,j.evidence_id,j.config||jsonb_build_object('force_page',p_page,'replace_text',true),j.page_count,'extraction') returning id into new_id;
 insert into public.document_ingestion_pages select new_id,page,text,method from public.document_ingestion_pages where job_id=p_job and page<>p_page;
 return new_id;
end $$;
revoke all on function public.ingestion_manage(uuid,integer) from public,anon,authenticated;
grant execute on function public.ingestion_manage(uuid,integer) to service_role;

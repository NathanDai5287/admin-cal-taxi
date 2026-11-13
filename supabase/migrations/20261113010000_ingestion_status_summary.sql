create function public.ingestion_status_summary(p_ids uuid[],p_policy boolean) returns jsonb
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
 'ingestion_status',j.status,'active',coalesce(j.status in ('queued','running','waiting'),false),
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

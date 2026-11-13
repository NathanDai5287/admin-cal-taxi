-- Staging is private; active retrieval tables are changed only on activation.
create table public.document_ingestion_jobs (
 id uuid primary key default gen_random_uuid(),
 policy_id uuid references public.policy_documents(id) on delete cascade,
 evidence_id uuid references public.accreditation_sources(id) on delete cascade,
 config jsonb not null,
 stage text not null default 'validation' check(stage in ('validation','extraction','chunking','embedding','activation','complete')),
 status text not null default 'queued' check(status in ('queued','running','waiting','paused','failed','cancelled','complete')),
 page_count integer check(page_count between 1 and 200),
 extraction_complete boolean not null default false,
 chunks_complete boolean not null default false,
 lease_token uuid, lease_until timestamptz,
 next_retry_at timestamptz not null default now(), failures integer not null default 0,
 error jsonb, created_at timestamptz not null default now(), progress_at timestamptz not null default now(),
 check(num_nonnulls(policy_id,evidence_id)=1)
);
create unique index ingestion_policy_active on public.document_ingestion_jobs(policy_id) where status not in ('complete','cancelled','failed');
create unique index ingestion_evidence_active on public.document_ingestion_jobs(evidence_id) where status not in ('complete','cancelled','failed');
create table public.document_ingestion_pages (
 job_id uuid references public.document_ingestion_jobs(id) on delete cascade,
 page integer not null check(page between 1 and 200), text text not null, method text not null,
 primary key(job_id,page)
);
create table public.document_ingestion_chunks (
 job_id uuid references public.document_ingestion_jobs(id) on delete cascade,
 ordinal integer not null check(ordinal>=0), content text not null, locator jsonb not null,
 request_hash text not null, embedding jsonb,
 primary key(job_id,ordinal)
);
create table public.document_ingestion_gates (
 model text primary key, token uuid, until_at timestamptz not null default now()
);
alter table public.document_ingestion_jobs enable row level security;
alter table public.document_ingestion_pages enable row level security;
alter table public.document_ingestion_chunks enable row level security;
alter table public.document_ingestion_gates enable row level security;
grant all on public.document_ingestion_jobs,public.document_ingestion_pages,public.document_ingestion_chunks,public.document_ingestion_gates to service_role;

create function public.ingestion_enqueue(p_source uuid,p_policy boolean,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.document_ingestion_jobs; s text;
begin
 if p_policy then select status into s from public.policy_documents where id=p_source for update;
 else select status into s from public.accreditation_sources where id=p_source for update; end if;
 if s is null or s in ('archived','published','superseded') then raise exception 'Source unavailable'; end if;
 select * into j from public.document_ingestion_jobs where (case when p_policy then policy_id=p_source else evidence_id=p_source end) and status not in ('complete','cancelled','failed') for update;
 if found then
  if (j.config-'force_page'-'replace_text')<>p_config then raise exception 'An existing job uses a different configuration. Cancel it before changing settings.'; end if;
  if j.status='paused' then update public.document_ingestion_jobs set status='queued',failures=0,next_retry_at=now() where id=j.id; end if;
  return j.id;
 end if;
 insert into public.document_ingestion_jobs(policy_id,evidence_id,config) values(case when p_policy then p_source end,case when not p_policy then p_source end,p_config) returning id into j.id;
 return j.id;
end $$;

create function public.ingestion_claim(p_token uuid) returns setof public.document_ingestion_jobs
language plpgsql security definer set search_path='' as $$
begin
 return query with candidate as (
 select id from public.document_ingestion_jobs where status in ('queued','waiting','running') and next_retry_at<=now() and coalesce(lease_until,'-infinity')<=now()
 order by progress_at,created_at for update skip locked limit 1
 ) update public.document_ingestion_jobs j set status='running',lease_token=p_token,lease_until=now()+interval '5 minutes' from candidate c where j.id=c.id returning j.*;
end $$;

create function public.ingestion_gate(p_model text,p_token uuid,p_seconds integer default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into public.document_ingestion_gates(model) values(p_model) on conflict do nothing;
 if p_seconds is null then
  update public.document_ingestion_gates set token=p_token,until_at=now()+interval '5 minutes' where model=p_model and until_at<=now();
 else
  update public.document_ingestion_gates set token=null,until_at=now()+make_interval(secs=>greatest(0,p_seconds)) where model=p_model and token=p_token;
 end if;
 return found;
end $$;

-- Every commit locks the parent before the job: deletion/archive cannot race a
-- checkpoint, and an expired worker cannot overwrite its replacement's result.
create function public.ingestion_commit(p_job uuid,p_token uuid,p_kind text,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j public.document_ingestion_jobs; s text; n integer; c record; existing text;
begin
 select * into j from public.document_ingestion_jobs where id=p_job;
 if j.policy_id is not null then select status into s from public.policy_documents where id=j.policy_id for update;
 else select status into s from public.accreditation_sources where id=j.evidence_id for update; end if;
 if s is null or s in ('archived','published','superseded') then raise exception 'Source unavailable'; end if;
 select * into j from public.document_ingestion_jobs where id=p_job for update;
 if j.lease_token is distinct from p_token or j.lease_until<=now() or j.status<>'running' then raise exception 'Worker lease expired'; end if;
 if p_kind='validated' then
  update public.document_ingestion_jobs set page_count=(p_data->>'pages')::int,stage='extraction' where id=p_job;
 elsif p_kind='page' then
  if j.stage<>'extraction' or (p_data->>'page')::int>j.page_count then raise exception 'Invalid page'; end if;
  select text into existing from public.document_ingestion_pages where job_id=p_job and page=(p_data->>'page')::int;
  if found and existing<>p_data->>'text' then raise exception 'Page checkpoint conflict'; end if;
  insert into public.document_ingestion_pages values(p_job,(p_data->>'page')::int,p_data->>'text',p_data->>'method') on conflict do nothing;
  if (select sum(length(text)) from public.document_ingestion_pages where job_id=p_job)>5000000 then raise exception 'Extraction too large'; end if;
  select count(*) into n from public.document_ingestion_pages where job_id=p_job;
  if n=j.page_count then update public.document_ingestion_jobs set extraction_complete=true,stage='chunking' where id=p_job; end if;
 elsif p_kind='chunks' then
  if j.stage not in ('validation','chunking') then raise exception 'Invalid chunk stage'; end if;
  if j.stage='chunking' and not j.extraction_complete then raise exception 'Extraction incomplete'; end if;
  n=jsonb_array_length(p_data);
  if n=0 or n>2000 then raise exception 'No readable text or too many chunks'; end if;
  for c in select value,ordinality from jsonb_array_elements(p_data) with ordinality loop
   if (c.value->>'ordinal')::int<>c.ordinality-1 or length(trim(c.value->>'content'))=0 then raise exception 'Invalid chunk order'; end if;
   insert into public.document_ingestion_chunks values(p_job,(c.value->>'ordinal')::int,c.value->>'content',c.value->'locator',c.value->>'request_hash',c.value->'embedding');
  end loop;
  update public.document_ingestion_jobs set extraction_complete=true,chunks_complete=true,stage='embedding' where id=p_job;
 elsif p_kind='embedding' then
  if j.stage<>'embedding' or jsonb_array_length(p_data->'embedding')<>768 then raise exception 'Invalid embedding'; end if;
  if not exists(select 1 from public.document_ingestion_chunks where job_id=p_job and ordinal=(p_data->>'ordinal')::int and request_hash=p_data->>'request_hash') then raise exception 'Embedding checkpoint conflict'; end if;
  update public.document_ingestion_chunks set embedding=p_data->'embedding' where job_id=p_job and ordinal=(p_data->>'ordinal')::int and request_hash=p_data->>'request_hash' and embedding is null;
 elsif p_kind='activate' then
  if not j.extraction_complete or not j.chunks_complete or exists(select 1 from public.document_ingestion_chunks where job_id=p_job and embedding is null) then raise exception 'Document incomplete'; end if;
  select count(*) into n from public.document_ingestion_chunks where job_id=p_job;
  if n=0 then raise exception 'No chunks'; end if;
  -- Existing chunks may be reused, but never silently replace cited text.
  if coalesce((j.config->>'replace_text')::boolean,false) then
   if j.evidence_id is not null and exists(select 1 from public.accreditation_citations c join public.accreditation_revisions r on r.id=c.revision_id where c.source_id=j.evidence_id and r.immutable) then raise exception 'Approved source text cannot change'; end if;
   if j.policy_id is not null then delete from public.policy_chunks where source_id=j.policy_id;
   else delete from public.accreditation_source_chunks where source_id=j.evidence_id; end if;
  end if;
  if j.policy_id is not null then
   if exists(select 1 from public.policy_chunks a full join (select * from public.document_ingestion_chunks where job_id=p_job) b on a.ordinal=b.ordinal where a.source_id=j.policy_id and (b.ordinal is null or a.content<>b.content or a.locator<>b.locator)) then raise exception 'Existing source text differs'; end if;
  else
   if exists(select 1 from public.accreditation_source_chunks a full join (select * from public.document_ingestion_chunks where job_id=p_job) b on a.ordinal=b.ordinal where a.source_id=j.evidence_id and (b.ordinal is null or a.content<>b.content or a.locator<>b.locator)) then raise exception 'Existing source text differs'; end if;
  end if;
  perform public.checkpoint_document_chunks(coalesce(j.policy_id,j.evidence_id),j.policy_id is not null,(select jsonb_agg(jsonb_build_object('ordinal',ordinal,'content',content,'locator',locator) order by ordinal) from public.document_ingestion_chunks where job_id=p_job));
  for c in select * from public.document_ingestion_chunks where job_id=p_job loop
   perform public.checkpoint_document_embedding(coalesce(j.policy_id,j.evidence_id),j.policy_id is not null,j.config->>'profile',c.ordinal,c.embedding,j.config->>'provider',j.config->>'model');
  end loop;
  perform public.activate_document_embeddings(coalesce(j.policy_id,j.evidence_id),j.policy_id is not null,j.config->>'profile');
  update public.document_ingestion_jobs set status='complete',stage='complete' where id=p_job;
 elsif p_kind='wait' then
  update public.document_ingestion_jobs set status=coalesce(p_data->>'status','waiting'),next_retry_at=(p_data->>'retry_at')::timestamptz,error=p_data->'error',failures=coalesce((p_data->>'failures')::int,failures) where id=p_job;
 else raise exception 'Unknown checkpoint'; end if;
 update public.document_ingestion_jobs set progress_at=now(),lease_token=null,lease_until=null,status=case when status='running' then 'queued' else status end,failures=case when p_kind='wait' then failures else 0 end where id=p_job;
end $$;

create function public.ingestion_archive_cancel() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('archived','published','superseded') then update public.document_ingestion_jobs set status='cancelled',lease_token=null,lease_until=null where (case when tg_table_name='policy_documents' then policy_id=new.id else evidence_id=new.id end) and status not in ('complete','cancelled'); end if;
 return new;
end $$;
create trigger ingestion_policy_archive after update of status on public.policy_documents for each row execute function public.ingestion_archive_cancel();
create trigger ingestion_evidence_archive after update of status on public.accreditation_sources for each row execute function public.ingestion_archive_cancel();
revoke all on function public.ingestion_enqueue(uuid,boolean,jsonb),public.ingestion_claim(uuid),public.ingestion_gate(text,uuid,integer),public.ingestion_commit(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingestion_enqueue(uuid,boolean,jsonb),public.ingestion_claim(uuid),public.ingestion_gate(text,uuid,integer),public.ingestion_commit(uuid,uuid,text,jsonb) to service_role;

create function public.ingestion_manage(p_job uuid,p_page integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.document_ingestion_jobs; s text; new_id uuid;
begin
 select * into j from public.document_ingestion_jobs where id=p_job;
 if j.policy_id is not null then select status into s from public.policy_documents where id=j.policy_id for update;
 else select status into s from public.accreditation_sources where id=j.evidence_id for update; end if;
 if s is null or s in ('archived','published','superseded') then raise exception 'Source unavailable'; end if;
 perform 1 from public.document_ingestion_jobs where id=p_job for update;
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

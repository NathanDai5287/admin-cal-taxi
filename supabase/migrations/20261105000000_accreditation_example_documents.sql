-- Additive example-based drafting. Existing templates and approved files are retained.
alter table public.accreditation_template_families add column workflow_mode text not null default 'legacy' check (workflow_mode in ('legacy','example_document'));
alter table public.accreditation_runs add column workflow_mode text not null default 'legacy' check (workflow_mode in ('legacy','example_document'));
alter table public.accreditation_run_working_state add column document jsonb;
alter table public.accreditation_run_working_state add column document_version integer not null default 0;
alter table public.accreditation_run_working_state add column example_ids uuid[] not null default '{}';
alter table public.accreditation_revisions add column document jsonb;
alter table public.accreditation_revisions add column document_version integer;

create table public.accreditation_example_batches (
  id uuid primary key,
  family_id uuid references public.accreditation_template_families(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.accreditation_examples (
  id uuid primary key,
  batch_id uuid not null references public.accreditation_example_batches(id),
  family_id uuid not null references public.accreditation_template_families(id),
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes between 1 and 26214400),
  storage_path text not null unique,
  sha256 text,
  status text not null default 'uploading' check(status in ('uploading','pending','processing','ready','failed')),
  units jsonb not null default '[]',
  page_count integer,
  analysis jsonb,
  error text,
  retry_after timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index accreditation_examples_family on public.accreditation_examples(family_id,created_at);
create index accreditation_examples_hash on public.accreditation_examples(sha256) where status = 'ready';
create table public.accreditation_document_requests (
  id uuid primary key,
  run_id uuid not null references public.accreditation_runs(id),
  kind text not null check(kind in ('chat','save','pdf')),
  version integer not null,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
  lease_token uuid,
  lease_until timestamptz,
  result jsonb,
  error text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.accreditation_ai_gate (
  id boolean primary key default true check(id), token uuid, until_at timestamptz not null default now()
);
insert into public.accreditation_ai_gate(id) values(true);

-- New mutations go through authenticated server entry points and service-only RPCs.
do $$ declare t text; begin
  foreach t in array array['accreditation_example_batches','accreditation_examples','accreditation_document_requests','accreditation_ai_gate'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('accreditation-examples','accreditation-examples',false,26214400,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create function public.accreditation_reserve_example(p_id uuid,p_batch uuid,p_family uuid,p_name text,p_filename text,p_mime text,p_size bigint,p_user uuid)
returns public.accreditation_examples language plpgsql security definer set search_path='' as $$
declare item public.accreditation_examples; family uuid; candidate text; suffix integer := 1;
begin
  perform pg_advisory_xact_lock(hashtext('accreditation-example-names'));
  select * into item from public.accreditation_examples where id=p_id;
  if found then
    if item.created_by<>p_user or item.batch_id<>p_batch or item.original_name<>p_filename or item.size_bytes<>p_size then raise exception 'Upload request does not match'; end if;
    return item;
  end if;
  if not exists(select 1 from public.accreditation_example_batches where id=p_batch and created_by=p_user and family_id is not distinct from p_family) then raise exception 'Batch not found'; end if;
  family := p_family;
  if family is null then
    candidate := left(p_name,160);
    while exists(select 1 from public.accreditation_template_families where lower(name)=lower(candidate) and archived_at is null) loop
      suffix := suffix+1;
      candidate := left(p_name,150)||' ('||suffix||')';
    end loop;
    insert into public.accreditation_template_families(name,workflow_mode,created_by) values(candidate,'example_document',p_user) returning id into family;
  elsif not exists(select 1 from public.accreditation_template_families where id=family and workflow_mode='example_document' and archived_at is null) then raise exception 'Document type not found'; end if;
  insert into public.accreditation_examples(id,batch_id,family_id,original_name,mime_type,size_bytes,storage_path,created_by)
  values(p_id,p_batch,family,p_filename,p_mime,p_size,family::text||'/'||p_id::text||'/original',p_user) returning * into item;
  return item;
end $$;

create function public.accreditation_claim_ai(p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.accreditation_ai_gate set token=p_token,until_at=now()+interval '4 minutes' where id and until_at<=now();
  return found;
end $$;
create function public.accreditation_release_ai(p_token uuid,p_seconds integer) returns void language sql security definer set search_path='' as $$
  update public.accreditation_ai_gate set token=null,until_at=now()+make_interval(secs=>greatest(0,least(p_seconds,86400))) where id and token=p_token;
$$;

create function public.accreditation_start_document(p_family uuid,p_cycle uuid,p_term uuid,p_user uuid,p_examples uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare run uuid; family_name text; year_name text;
begin
  perform pg_advisory_xact_lock(hashtext(p_family::text||p_cycle::text||coalesce(p_term::text,'')));
  select name into family_name from public.accreditation_template_families where id=p_family and workflow_mode='example_document' and archived_at is null;
  select label into year_name from public.academic_years where id=p_cycle;
  if family_name is null or year_name is null then raise exception 'Choose a document type and academic year'; end if;
  if cardinality(p_examples)=0 or exists(select 1 from unnest(p_examples) e where not exists(select 1 from public.accreditation_examples where id=e and family_id=p_family and status='ready')) then raise exception 'Choose ready examples'; end if;
  select id into run from public.accreditation_runs where template_family_id=p_family and cycle_id=p_cycle and term_id is not distinct from p_term and status<>'approved';
  if run is not null then return run; end if;
  insert into public.accreditation_runs(template_family_id,cycle_id,term_id,title,workflow_mode,created_by)
  values(p_family,p_cycle,p_term,left(year_name||' '||family_name,160),'example_document',p_user) returning id into run;
  insert into public.accreditation_run_working_state(run_id,example_ids,updated_by) values(run,p_examples,p_user);
  return run;
end $$;

create function public.accreditation_claim_document_request(p_id uuid,p_run uuid,p_kind text,p_version integer,p_payload jsonb,p_user uuid,p_token uuid)
returns public.accreditation_document_requests language plpgsql security definer set search_path='' as $$
declare item public.accreditation_document_requests; current_version integer;
begin
  perform 1 from public.accreditation_runs where id=p_run and workflow_mode='example_document' and status<>'approved' for update;
  if not found then raise exception 'This document is not editable'; end if;
  select * into item from public.accreditation_document_requests where id=p_id for update;
  if found then
    if item.run_id<>p_run or item.kind<>p_kind or item.created_by<>p_user or item.payload<>p_payload or item.version<>p_version then raise exception 'Request does not match'; end if;
    if item.status='completed' then return item; end if;
    if item.lease_until>now() then raise exception 'This request is still processing'; end if;
  end if;
  select document_version into current_version from public.accreditation_run_working_state where run_id=p_run;
  if current_version is distinct from p_version then raise exception 'The draft changed. Reload before continuing'; end if;
  if item.id is null then
    insert into public.accreditation_document_requests(id,run_id,kind,version,payload,created_by) values(p_id,p_run,p_kind,p_version,p_payload,p_user) returning * into item;
    if p_kind='chat' then insert into public.accreditation_run_messages(run_id,role,content,created_by) values(p_run,'user',p_payload->>'message',p_user); end if;
  end if;
  update public.accreditation_document_requests set status='processing',lease_token=p_token,lease_until=now()+interval '4 minutes',error=null where id=p_id returning * into item;
  return item;
end $$;

create function public.accreditation_finish_document_request(p_id uuid,p_token uuid,p_document jsonb,p_readiness jsonb,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.accreditation_document_requests; current_version integer; next_revision integer; revision uuid;
begin
  select * into item from public.accreditation_document_requests where id=p_id;
  if item.id is null then raise exception 'Request not found'; end if;
  perform 1 from public.accreditation_runs where id=item.run_id and status<>'approved' for update;
  if not found then raise exception 'This document is no longer editable'; end if;
  select * into item from public.accreditation_document_requests where id=p_id for update;
  if item.status='completed' then return item.result; end if;
  if item.lease_token is distinct from p_token or item.status<>'processing' then raise exception 'Request expired'; end if;
  select document_version into current_version from public.accreditation_run_working_state where run_id=item.run_id for update;
  if current_version<>item.version then raise exception 'The draft changed. Reload before continuing'; end if;
  if item.kind='pdf' then
    select coalesce(max(revision_number),0)+1 into next_revision from public.accreditation_revisions where run_id=item.run_id;
    revision := (p_result->>'revisionId')::uuid;
    insert into public.accreditation_revisions(id,run_id,revision_number,draft,document,document_version,source_manifest,validation,provider_config,created_by)
    values(revision,item.run_id,next_revision,'{"fields":{}}',p_document,current_version,coalesce(p_readiness->'sources','[]'),coalesce(p_readiness->'validation','[]'),jsonb_build_object('mode','example_document','model',p_readiness->>'model'),item.created_by);
    insert into public.accreditation_artifacts(id,revision_id,kind,storage_path,filename,mime_type,size_bytes,sha256,created_by)
    values((p_result->>'artifactId')::uuid,revision,'draft',p_result->>'path',p_result->>'filename','application/pdf',(p_result->>'size')::bigint,p_result->>'sha256',item.created_by);
    update public.accreditation_runs set status='ready_for_review' where id=item.run_id;
  else
    update public.accreditation_run_working_state set document=p_document,document_version=document_version+1,readiness=p_readiness,updated_by=item.created_by,updated_at=now(),example_ids=coalesce(array(select jsonb_array_elements_text(item.payload->'exampleIds')::uuid),example_ids) where run_id=item.run_id;
    if item.kind='chat' then insert into public.accreditation_run_messages(run_id,role,content,created_by) values(item.run_id,'assistant',p_result->>'answer',item.created_by); end if;
    update public.accreditation_runs set status='collecting' where id=item.run_id;
    p_result := p_result || jsonb_build_object('version',current_version+1);
  end if;
  update public.accreditation_document_requests set status='completed',result=p_result,lease_until=null where id=p_id;
  return p_result;
end $$;

-- Protect newly added state even if a caller bypasses the UI or uses a legacy action.
create function public.guard_example_document_state() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid; mode text; run_status text;
begin
  rid := case when tg_op='DELETE' then old.run_id else new.run_id end;
  select workflow_mode,status into mode,run_status from public.accreditation_runs where id=rid for update;
  if mode='example_document' and run_status='approved' then raise exception 'Approved documents are immutable'; end if;
  if mode='example_document' and auth.role() is distinct from 'service_role' then raise exception 'Use the document workspace to edit this draft'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_example_working_state before insert or update or delete on public.accreditation_run_working_state for each row execute function public.guard_example_document_state();
create trigger guard_example_messages before insert or update or delete on public.accreditation_run_messages for each row execute function public.guard_example_document_state();

create function public.guard_example_document_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.workflow_mode='example_document' and new.status='approved' and not exists(
    select 1 from public.accreditation_revisions r join public.accreditation_run_working_state s on s.run_id=r.run_id
    where r.id=new.approved_revision_id and r.run_id=new.id and r.document_version=s.document_version
  ) then raise exception 'Generate and review the latest draft before approving'; end if;
  return new;
end $$;
create trigger guard_example_approval before update on public.accreditation_runs for each row execute function public.guard_example_document_approval();

do $$ declare fn regprocedure; begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('accreditation_reserve_example','accreditation_claim_ai','accreditation_release_ai','accreditation_start_document','accreditation_claim_document_request','accreditation_finish_document_request') loop
    execute format('revoke all on function %s from public, anon, authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end $$;

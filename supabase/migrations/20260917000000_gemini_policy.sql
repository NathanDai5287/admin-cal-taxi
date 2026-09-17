-- Additive migration: legacy accreditation vectors and approved artifacts are retained.
alter table public.accreditation_source_chunks
  add column embedding_v2 extensions.vector(768),
  add column embedding_v2_provider text,
  add column embedding_v2_model text,
  add column embedding_dimensions integer,
  add column embedding_profile text;
alter table public.accreditation_sources add column active_embedding_profile text;
create index accreditation_chunks_v2_hnsw on public.accreditation_source_chunks
  using hnsw (embedding_v2 extensions.vector_cosine_ops);

create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', authority text not null default '',
  document_type text not null default 'policy', version_label text not null default '',
  effective_from date, effective_until date,
  status text not null default 'draft' check (status in ('draft','published','superseded','failed','archived')),
  content_hash text not null, replacement_document_id uuid references public.policy_documents(id),
  storage_path text not null unique, original_name text not null, mime_type text not null,
  processing_state text not null default 'pending' check (processing_state in ('pending','processing','ready','failed')),
  processing_error text, active_embedding_profile text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  published_by uuid references public.profiles(id), published_at timestamptz,
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  superseded_by uuid references public.profiles(id), superseded_at timestamptz,
  check (effective_until is null or effective_until >= effective_from),
  check (replacement_document_id is distinct from id)
);
create table public.policy_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.policy_documents(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0), content text not null check (length(content) > 0),
  locator jsonb not null default '{}',
  embedding_v2 extensions.vector(768) not null,
  embedding_provider text not null, embedding_model text not null,
  embedding_dimensions integer not null check (embedding_dimensions = 768), embedding_profile text not null,
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  unique (source_id, ordinal)
);
create index policy_chunks_search on public.policy_chunks using gin(search_vector);
create index policy_chunks_v2_hnsw on public.policy_chunks using hnsw(embedding_v2 extensions.vector_cosine_ops);
create table public.policy_questions (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.profiles(id),
  question text not null check (length(question) between 1 and 4000), question_date date not null,
  answer jsonb, retrieved_chunks jsonb not null default '[]', model_config jsonb not null default '{}',
  error text, created_at timestamptz not null default now()
);
create index policy_questions_member_time on public.policy_questions(member_id, created_at desc);

create function public.is_policy_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('member','admin') and removed_at is null);
$$;
revoke all on function public.is_policy_member() from public;
grant execute on function public.is_policy_member() to authenticated, service_role;
alter table public.policy_documents enable row level security;
alter table public.policy_chunks enable row level security;
alter table public.policy_questions enable row level security;
grant select, insert, update, delete on public.policy_documents, public.policy_chunks to authenticated;
grant select on public.policy_questions to authenticated;
grant all on public.policy_documents, public.policy_chunks, public.policy_questions to service_role;
create policy policy_admin_documents on public.policy_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy policy_member_documents on public.policy_documents for select to authenticated using (
  public.is_policy_member() and status = 'published' and processing_state = 'ready'
  and effective_from <= current_date and (effective_until is null or effective_until >= current_date)
);
create policy policy_admin_chunks on public.policy_chunks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy policy_member_chunks on public.policy_chunks for select to authenticated using (
  public.is_policy_member() and exists(select 1 from public.policy_documents d where d.id = source_id
    and d.status = 'published' and d.processing_state = 'ready' and d.active_embedding_profile = embedding_profile
    and d.effective_from <= current_date and (d.effective_until is null or d.effective_until >= current_date))
);
create policy policy_question_audit on public.policy_questions for select to authenticated using (
  public.is_policy_member() and (member_id = auth.uid() or public.is_admin())
);
insert into storage.buckets(id, name, public, file_size_limit)
values ('policy-documents','policy-documents',false,26214400);
create policy policy_admin_storage on storage.objects for all to authenticated
using (bucket_id = 'policy-documents' and public.is_admin()) with check (bucket_id = 'policy-documents' and public.is_admin());

-- Publication validation also applies to direct administrator SQL/API writes.
create function public.validate_policy_publication() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('published','superseded') and
    (to_jsonb(new) - array['status','replacement_document_id','superseded_by','superseded_at']) is distinct from
    (to_jsonb(old) - array['status','replacement_document_id','superseded_by','superseded_at']) then
    raise exception 'Published content is immutable; upload a new version';
  end if;
  if old.status in ('published','superseded','archived') and new.status in ('draft','failed') then raise exception 'Upload a new version'; end if;
  if old.status in ('superseded','archived') and new.status = 'published' then raise exception 'Upload a new version'; end if;
  if new.status = 'published' then
    if new.processing_state <> 'ready' or trim(new.title) = '' or trim(new.authority) = ''
      or trim(new.version_label) = '' or new.effective_from is null or new.reviewed_at is null
      or new.reviewed_by is null or new.published_at is null or new.published_by is null
      or new.active_embedding_profile is null
      or not exists(select 1 from public.policy_chunks c where c.source_id = new.id)
      or exists(select 1 from public.policy_chunks c where c.source_id = new.id and (c.embedding_v2 is null or c.embedding_profile <> new.active_embedding_profile)) then
      raise exception 'Review complete extraction and embeddings and provide publication metadata first';
    end if;
  end if;
  return new;
end; $$;
create trigger policy_publication before insert or update on public.policy_documents for each row execute function public.validate_policy_publication();
create function public.guard_policy_chunks() returns trigger language plpgsql set search_path = '' as $$
declare doc uuid;
begin
  if tg_op = 'DELETE' then doc := old.source_id; else doc := new.source_id; end if;
  perform 1 from public.policy_documents where id = doc and status in ('draft','failed') for update;
  if not found then raise exception 'Only draft policy chunks may change'; end if;
  if tg_op = 'UPDATE' and new.source_id <> old.source_id then raise exception 'Cannot move policy chunks'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end; $$;
create trigger policy_chunk_guard before insert or update or delete on public.policy_chunks for each row execute function public.guard_policy_chunks();

-- Atomic per-source profile activation. No partially embedded source can enter retrieval.
create function public.commit_document_embeddings(p_source uuid, p_policy boolean, p_profile text, p_chunks jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_array_length(p_chunks) = 0 then raise exception 'No chunks'; end if;
  if exists(select 1 from jsonb_array_elements(p_chunks) c where c->>'embedding_profile' is distinct from p_profile or (c->>'embedding_dimensions')::int <> 768 or c->>'embedding_v2' is null) then raise exception 'Incomplete embedding profile'; end if;
  if p_policy then
    perform 1 from public.policy_documents where id = p_source and status in ('draft','failed') for update;
    if not found then raise exception 'Only draft policies may be processed'; end if;
    delete from public.policy_chunks where source_id = p_source;
    insert into public.policy_chunks(source_id, ordinal, content, locator, embedding_v2, embedding_provider, embedding_model, embedding_dimensions, embedding_profile)
    select p_source, (c->>'ordinal')::int, c->>'content', c->'locator', (c->>'embedding_v2')::extensions.vector(768), c->>'embedding_provider', c->>'embedding_model', 768, p_profile from jsonb_array_elements(p_chunks) c;
    update public.policy_documents set status = 'draft', processing_state = 'ready', processing_error = null, active_embedding_profile = p_profile, reviewed_at = null, reviewed_by = null where id = p_source;
  else
    perform 1 from public.accreditation_sources where id = p_source and status <> 'archived' for update;
    if not found then raise exception 'Source unavailable'; end if;
    -- Upsert preserves the legacy vector column during re-embedding.
    insert into public.accreditation_source_chunks(source_id, ordinal, content, locator, embedding_v2, embedding_v2_provider, embedding_v2_model, embedding_dimensions, embedding_profile)
    select p_source, (c->>'ordinal')::int, c->>'content', c->'locator', (c->>'embedding_v2')::extensions.vector(768), c->>'embedding_provider', c->>'embedding_model', 768, p_profile from jsonb_array_elements(p_chunks) c
    on conflict(source_id, ordinal) do update set content = excluded.content, locator = excluded.locator, embedding_v2 = excluded.embedding_v2, embedding_v2_provider = excluded.embedding_v2_provider, embedding_v2_model = excluded.embedding_v2_model, embedding_dimensions = 768, embedding_profile = excluded.embedding_profile;
    if exists(select 1 from public.accreditation_source_chunks c where c.source_id = p_source and (c.embedding_v2 is null or c.embedding_profile is distinct from p_profile)) then raise exception 'All existing chunks must be re-embedded'; end if;
    update public.accreditation_sources set status = 'ready', processing_error = null, active_embedding_profile = p_profile where id = p_source;
  end if;
end; $$;
revoke all on function public.commit_document_embeddings(uuid,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.commit_document_embeddings(uuid,boolean,text,jsonb) to service_role;

create function public.search_report_evidence(p_query text, p_embedding extensions.vector(768), p_profile text, p_cycle uuid, p_term uuid, p_report text)
returns table(source_id uuid, ordinal int, content text, locator jsonb, source_name text, kind text, sha256 text, score double precision)
language sql stable security definer set search_path = public, extensions as $$
  with eligible as materialized (
    select c.*, s.original_name, s.kind::text as source_kind, s.sha256 from public.accreditation_source_chunks c
    join public.accreditation_sources s on s.id = c.source_id
    where (auth.role() = 'service_role' or public.is_admin()) and s.status = 'ready' and s.cycle_id = p_cycle
      and (p_term is null or s.term_id is null or s.term_id = p_term)
      and (s.report_key is null or s.report_key::text = p_report)
      and s.kind <> 'blank_template' and s.active_embedding_profile = p_profile and c.embedding_profile = p_profile and c.embedding_v2 is not null
  ), v as (select id, row_number() over(order by embedding_v2 <=> p_embedding, id) r from eligible order by embedding_v2 <=> p_embedding, id limit 40),
  t as (select id, row_number() over(order by ts_rank_cd(search_vector, websearch_to_tsquery('english',p_query)) desc, id) r from eligible where search_vector @@ websearch_to_tsquery('english',p_query) order by ts_rank_cd(search_vector, websearch_to_tsquery('english',p_query)) desc, id limit 40),
  ranks as (select id, sum(1.0/(60+r))::double precision score from (select * from v union all select * from t) candidates group by id)
  select e.source_id,e.ordinal,e.content,e.locator,e.original_name,e.source_kind,e.sha256,r.score from ranks r join eligible e using(id) order by r.score desc,e.id limit 18;
$$;
revoke all on function public.search_report_evidence(text,extensions.vector,text,uuid,uuid,text) from public, anon;
grant execute on function public.search_report_evidence(text,extensions.vector,text,uuid,uuid,text) to authenticated,service_role;

-- Explicit date argument authorizes only published policies effective for that question.
create function public.search_policy_chunks(p_query text, p_embedding extensions.vector(768), p_profile text, p_date date)
returns table(source_id uuid, ordinal int, content text, locator jsonb, title text, authority text, version_label text, score double precision)
language sql stable security definer set search_path = public, extensions as $$
  with eligible as materialized (
    select c.*,d.title,d.authority,d.version_label from public.policy_chunks c join public.policy_documents d on d.id = c.source_id
    where public.is_policy_member() and d.status = 'published' and d.processing_state = 'ready'
      and d.effective_from <= p_date and (d.effective_until is null or d.effective_until >= p_date)
      and d.active_embedding_profile = p_profile and c.embedding_profile = p_profile
  ), v as (select id, row_number() over(order by embedding_v2 <=> p_embedding, id) r from eligible order by embedding_v2 <=> p_embedding, id limit 40),
  t as (select id, row_number() over(order by ts_rank_cd(search_vector, websearch_to_tsquery('english',p_query)) desc, id) r from eligible where search_vector @@ websearch_to_tsquery('english',p_query) order by ts_rank_cd(search_vector, websearch_to_tsquery('english',p_query)) desc, id limit 40),
  ranks as (select id, sum(1.0/(60+r))::double precision score from (select * from v union all select * from t) candidates group by id)
  select e.source_id,e.ordinal,e.content,e.locator,e.title,e.authority,e.version_label,r.score from ranks r join eligible e using(id) order by r.score desc,e.id limit 12;
$$;
revoke all on function public.search_policy_chunks(text,extensions.vector,text,date) from public,anon;
grant execute on function public.search_policy_chunks(text,extensions.vector,text,date) to authenticated;

-- Reserve before contacting Gemini, under a per-member lock, including failed attempts.
create function public.reserve_policy_question(p_member uuid,p_question text,p_date date,p_minute int,p_day int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not exists(select 1 from public.profiles where id = p_member and role in ('member','admin') and removed_at is null) then raise exception 'Member access required'; end if;
  if p_minute < 1 or p_day < 1 then raise exception 'Invalid quota'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_member::text, 712));
  if (select count(*) from public.policy_questions where member_id = p_member and created_at > now() - interval '1 minute') >= p_minute
    or (select count(*) from public.policy_questions where member_id = p_member and created_at > now() - interval '24 hours') >= p_day then
    raise exception 'Question limit reached. Retry after the minute or daily window resets.' using errcode = 'P0001';
  end if;
  insert into public.policy_questions(member_id,question,question_date) values(p_member,p_question,p_date) returning id into result;
  return result;
end; $$;
revoke all on function public.reserve_policy_question(uuid,text,date,int,int) from public,anon,authenticated;
grant execute on function public.reserve_policy_question(uuid,text,date,int,int) to service_role;

-- Retain report approval but enforce the identity of RPC callers.
-- Branch before accessing table-specific fields; PostgreSQL resolves record fields
-- even when an AND condition would otherwise short-circuit.
create or replace function public.guard_accreditation_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'accreditation_runs' then
    if old.status = 'approved' then raise exception 'Approved accreditation runs are immutable'; end if;
  elsif tg_table_name = 'accreditation_revisions' then
    if old.immutable then raise exception 'Approved accreditation revisions are immutable'; end if;
  elsif tg_table_name = 'accreditation_artifacts' then
    if exists(select 1 from public.accreditation_revisions where id = old.revision_id and immutable) then
      raise exception 'Approved accreditation artifacts are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.guard_accreditation_revision_children()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    if exists(select 1 from public.accreditation_revisions where id = old.revision_id and immutable) then
      raise exception 'Children of approved accreditation revisions are immutable';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if exists(select 1 from public.accreditation_revisions where id = new.revision_id and immutable) then
      raise exception 'Children of approved accreditation revisions are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

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
  if auth.role() is distinct from 'service_role' and (not public.is_admin() or auth.uid() is distinct from p_approved_by) then
    raise exception 'Only the authenticated administrator may approve reports';
  end if;
  perform 1 from public.accreditation_runs where id = p_run_id for update;
  perform 1 from public.accreditation_revisions where id = p_revision_id for update;
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

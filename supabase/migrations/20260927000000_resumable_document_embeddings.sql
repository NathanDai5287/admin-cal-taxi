-- Persist extracted passages and individual embeddings so a rate-limited job can
-- resume at its first incomplete passage without exposing partial documents.
alter table public.policy_chunks
  alter column embedding_v2 drop not null,
  alter column embedding_provider drop not null,
  alter column embedding_model drop not null,
  alter column embedding_dimensions drop not null,
  alter column embedding_profile drop not null;

-- Checkpoints are separate from the active retrieval vectors. This preserves a
-- previously active profile while a replacement profile is only partly built.
create table public.policy_embedding_checkpoints (
  source_id uuid not null references public.policy_documents(id) on delete cascade,
  embedding_profile text not null,
  ordinal integer not null check (ordinal >= 0),
  embedding extensions.vector(768) not null,
  embedding_provider text not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  primary key (source_id, embedding_profile, ordinal)
);
create table public.accreditation_embedding_checkpoints (
  source_id uuid not null references public.accreditation_sources(id) on delete cascade,
  embedding_profile text not null,
  ordinal integer not null check (ordinal >= 0),
  embedding extensions.vector(768) not null,
  embedding_provider text not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  primary key (source_id, embedding_profile, ordinal)
);
alter table public.policy_embedding_checkpoints enable row level security;
alter table public.accreditation_embedding_checkpoints enable row level security;
grant all on public.policy_embedding_checkpoints, public.accreditation_embedding_checkpoints to service_role;

create or replace function public.guard_policy_chunks() returns trigger
language plpgsql set search_path = '' as $$
declare doc uuid;
begin
  -- Permit the foreign-key cascade when an eligible parent document is deleted.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  if tg_op = 'DELETE' then doc := old.source_id; else doc := new.source_id; end if;
  perform 1 from public.policy_documents where id = doc and status in ('draft','failed') for update;
  if not found then raise exception 'Only draft policy chunks may change'; end if;
  if tg_op = 'UPDATE' and new.source_id <> old.source_id then raise exception 'Cannot move policy chunks'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end; $$;

create function public.checkpoint_document_chunks(p_source uuid, p_policy boolean, p_chunks jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare chunk_count integer;
begin
  chunk_count := jsonb_array_length(p_chunks);
  if chunk_count = 0 then raise exception 'No chunks'; end if;
  if exists(select 1 from jsonb_array_elements(p_chunks) c where trim(coalesce(c->>'content','')) = '') then
    raise exception 'Every chunk requires content';
  end if;
  if p_policy then
    perform 1 from public.policy_documents where id = p_source and status in ('draft','failed') for update;
    if not found then raise exception 'Only draft policies may be processed'; end if;
    insert into public.policy_chunks(source_id, ordinal, content, locator)
    select p_source, (c->>'ordinal')::int, c->>'content', coalesce(c->'locator','{}'::jsonb)
      from jsonb_array_elements(p_chunks) c
    on conflict(source_id, ordinal) do nothing;
    update public.policy_documents set processing_total = chunk_count where id = p_source;
  else
    perform 1 from public.accreditation_sources where id = p_source and status <> 'archived' for update;
    if not found then raise exception 'Source unavailable'; end if;
    insert into public.accreditation_source_chunks(source_id, ordinal, content, locator)
    select p_source, (c->>'ordinal')::int, c->>'content', coalesce(c->'locator','{}'::jsonb)
      from jsonb_array_elements(p_chunks) c
    on conflict(source_id, ordinal) do nothing;
    update public.accreditation_sources set processing_total = chunk_count where id = p_source;
  end if;
end; $$;

create function public.checkpoint_document_embedding(
  p_source uuid,
  p_policy boolean,
  p_profile text,
  p_ordinal integer,
  p_embedding jsonb,
  p_provider text,
  p_model text
) returns integer language plpgsql security definer set search_path = '' as $$
declare completed integer;
begin
  if p_profile = '' or p_provider = '' or p_model = '' or jsonb_array_length(p_embedding) <> 768 then
    raise exception 'Invalid embedding checkpoint';
  end if;
  if p_policy then
    perform 1 from public.policy_documents where id = p_source and status in ('draft','failed') for update;
    if not found then raise exception 'Only draft policies may be processed'; end if;
    perform 1 from public.policy_chunks where source_id = p_source and ordinal = p_ordinal;
    if not found then raise exception 'Chunk unavailable'; end if;
    insert into public.policy_embedding_checkpoints(
      source_id, embedding_profile, ordinal, embedding, embedding_provider, embedding_model
    ) values (
      p_source, p_profile, p_ordinal, (p_embedding::text)::extensions.vector(768), p_provider, p_model
    ) on conflict(source_id, embedding_profile, ordinal) do update set
      embedding = excluded.embedding,
      embedding_provider = excluded.embedding_provider,
      embedding_model = excluded.embedding_model,
      created_at = now();
    select count(*)::integer into completed from public.policy_embedding_checkpoints
      where source_id = p_source and embedding_profile = p_profile;
    update public.policy_documents set processing_completed = completed where id = p_source;
  else
    perform 1 from public.accreditation_sources where id = p_source and status <> 'archived' for update;
    if not found then raise exception 'Source unavailable'; end if;
    perform 1 from public.accreditation_source_chunks where source_id = p_source and ordinal = p_ordinal;
    if not found then raise exception 'Chunk unavailable'; end if;
    insert into public.accreditation_embedding_checkpoints(
      source_id, embedding_profile, ordinal, embedding, embedding_provider, embedding_model
    ) values (
      p_source, p_profile, p_ordinal, (p_embedding::text)::extensions.vector(768), p_provider, p_model
    ) on conflict(source_id, embedding_profile, ordinal) do update set
      embedding = excluded.embedding,
      embedding_provider = excluded.embedding_provider,
      embedding_model = excluded.embedding_model,
      created_at = now();
    select count(*)::integer into completed from public.accreditation_embedding_checkpoints
      where source_id = p_source and embedding_profile = p_profile;
    update public.accreditation_sources set processing_completed = completed where id = p_source;
  end if;
  return completed;
end; $$;

create function public.activate_document_embeddings(p_source uuid, p_policy boolean, p_profile text)
returns void language plpgsql security definer set search_path = '' as $$
declare chunk_count integer;
begin
  if p_policy then
    perform 1 from public.policy_documents where id = p_source and status in ('draft','failed') for update;
    if not found then raise exception 'Only draft policies may be processed'; end if;
    select count(*)::integer into chunk_count from public.policy_chunks where source_id = p_source;
    if chunk_count = 0 or exists(
      select 1 from public.policy_chunks c where c.source_id = p_source and not exists(
        select 1 from public.policy_embedding_checkpoints e
        where e.source_id = c.source_id and e.ordinal = c.ordinal and e.embedding_profile = p_profile
      )
    ) then raise exception 'All chunks must be embedded with the active profile'; end if;
    update public.policy_chunks c set
      embedding_v2 = e.embedding,
      embedding_provider = e.embedding_provider,
      embedding_model = e.embedding_model,
      embedding_dimensions = 768,
      embedding_profile = e.embedding_profile
    from public.policy_embedding_checkpoints e
    where c.source_id = p_source and e.source_id = c.source_id and e.ordinal = c.ordinal and e.embedding_profile = p_profile;
    update public.policy_documents set status = 'draft', processing_state = 'ready', processing_error = null,
      active_embedding_profile = p_profile, processing_total = chunk_count, processing_completed = chunk_count,
      reviewed_at = null, reviewed_by = null where id = p_source;
    delete from public.policy_embedding_checkpoints where source_id = p_source;
  else
    perform 1 from public.accreditation_sources where id = p_source and status <> 'archived' for update;
    if not found then raise exception 'Source unavailable'; end if;
    select count(*)::integer into chunk_count from public.accreditation_source_chunks where source_id = p_source;
    if chunk_count = 0 or exists(
      select 1 from public.accreditation_source_chunks c where c.source_id = p_source and not exists(
        select 1 from public.accreditation_embedding_checkpoints e
        where e.source_id = c.source_id and e.ordinal = c.ordinal and e.embedding_profile = p_profile
      )
    ) then raise exception 'All chunks must be embedded with the active profile'; end if;
    update public.accreditation_source_chunks c set
      embedding_v2 = e.embedding,
      embedding_v2_provider = e.embedding_provider,
      embedding_v2_model = e.embedding_model,
      embedding_dimensions = 768,
      embedding_profile = e.embedding_profile
    from public.accreditation_embedding_checkpoints e
    where c.source_id = p_source and e.source_id = c.source_id and e.ordinal = c.ordinal and e.embedding_profile = p_profile;
    update public.accreditation_sources set status = 'ready', processing_error = null,
      active_embedding_profile = p_profile, processing_total = chunk_count, processing_completed = chunk_count
      where id = p_source;
    delete from public.accreditation_embedding_checkpoints where source_id = p_source;
  end if;
end; $$;

revoke all on function public.checkpoint_document_chunks(uuid,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.checkpoint_document_embedding(uuid,boolean,text,integer,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.activate_document_embeddings(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.checkpoint_document_chunks(uuid,boolean,jsonb) to service_role;
grant execute on function public.checkpoint_document_embedding(uuid,boolean,text,integer,jsonb,text,text) to service_role;
grant execute on function public.activate_document_embeddings(uuid,boolean,text) to service_role;

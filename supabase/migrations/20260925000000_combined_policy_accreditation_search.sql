-- Ask Policy is an administrator workspace that may use both explicitly
-- published policy and ready accreditation evidence. Keep the two source
-- classes distinct in the result so the UI and model can describe provenance.
create function public.search_policy_and_accreditation_chunks(
  p_query text,
  p_embedding extensions.vector(768),
  p_profile text,
  p_date date
)
returns table(
  source_type text,
  source_id uuid,
  ordinal integer,
  content text,
  locator jsonb,
  title text,
  subtitle text,
  score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with eligible as materialized (
    select
      'policy'::text as source_type,
      c.id,
      c.source_id,
      c.ordinal,
      c.content,
      c.locator,
      c.embedding_v2,
      c.search_vector,
      d.title,
      concat_ws(' · ', d.authority, d.version_label) as subtitle
    from public.policy_chunks c
    join public.policy_documents d on d.id = c.source_id
    where public.is_admin()
      and d.status = 'published'
      and d.processing_state = 'ready'
      and d.effective_from <= p_date
      and (d.effective_until is null or d.effective_until >= p_date)
      and d.active_embedding_profile = p_profile
      and c.embedding_profile = p_profile
      and c.embedding_v2 is not null

    union all

    select
      'accreditation'::text as source_type,
      c.id,
      c.source_id,
      c.ordinal,
      c.content,
      c.locator,
      c.embedding_v2,
      c.search_vector,
      s.original_name as title,
      concat_ws(' · ', replace(s.kind::text, '_', ' '), cycle.label) as subtitle
    from public.accreditation_source_chunks c
    join public.accreditation_sources s on s.id = c.source_id
    join public.accreditation_cycles cycle on cycle.id = s.cycle_id
    where public.is_admin()
      and s.status = 'ready'
      and s.kind <> 'blank_template'
      and s.active_embedding_profile = p_profile
      and c.embedding_profile = p_profile
      and c.embedding_v2 is not null
  ), vector_ranked as (
    select source_type, id, row_number() over (partition by source_type order by embedding_v2 <=> p_embedding, id) as rank
    from eligible
  ), vector_rank as (
    select * from vector_ranked where rank <= 40
  ), text_ranked as (
    select source_type, id, row_number() over (partition by source_type order by ts_rank_cd(search_vector, websearch_to_tsquery('english', p_query)) desc, id) as rank
    from eligible
    where search_vector @@ websearch_to_tsquery('english', p_query)
  ), text_rank as (
    select * from text_ranked where rank <= 40
  ), ranks as (
    select source_type, id, sum(1.0 / (60 + rank))::double precision as score
    from (
      select * from vector_rank
      union all
      select * from text_rank
    ) candidates
    group by source_type, id
  ), scored as (
    select
      e.*,
      ranks.score,
      row_number() over (partition by e.source_type order by ranks.score desc, e.id) as source_rank
    from ranks
    join eligible e using (source_type, id)
  )
  select
    e.source_type,
    e.source_id,
    e.ordinal,
    e.content,
    e.locator,
    e.title,
    e.subtitle,
    e.score
  from scored e
  where e.source_rank <= 12
  order by e.score desc, e.source_type, e.id
  limit 24;
$$;

revoke all on function public.search_policy_and_accreditation_chunks(text, extensions.vector, text, date) from public, anon, authenticated;
grant execute on function public.search_policy_and_accreditation_chunks(text, extensions.vector, text, date) to authenticated;

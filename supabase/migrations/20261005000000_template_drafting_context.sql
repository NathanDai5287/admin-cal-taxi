-- Drafting retrieves requirements separately from historical examples, scoped
-- to this form. Earlier years remain available for variation and comparison.
create function public.search_template_drafting_context(
  p_query text, p_embedding extensions.vector(768), p_profile text,
  p_date date, p_family uuid, p_cycle_start date
)
returns table (
  source_kind text, source_id uuid, ordinal integer, content text,
  locator jsonb, title text, score double precision
)
language sql stable security definer set search_path = public, extensions
as $$
  with eligible as materialized (
    select 'policy'::text as source_kind, c.id, c.source_id, c.ordinal,
      c.content, c.locator, c.embedding_v2, c.search_vector, d.title
    from public.policy_chunks c
    join public.policy_documents d on d.id = c.source_id
    where (auth.role() = 'service_role' or public.is_admin())
      and d.status = 'published' and d.processing_state = 'ready'
      and d.effective_from <= p_date
      and (d.effective_until is null or d.effective_until >= p_date)
      and d.active_embedding_profile = p_profile
      and c.embedding_profile = p_profile and c.embedding_v2 is not null
    union all
    select s.kind::text, c.id, c.source_id, c.ordinal,
      c.content, c.locator, c.embedding_v2, c.search_vector,
      concat(s.original_name, ' · ', y.label)
    from public.accreditation_source_chunks c
    join public.accreditation_sources s on s.id = c.source_id
    join public.academic_years y on y.id = s.cycle_id
    where (auth.role() = 'service_role' or public.is_admin())
      and s.status = 'ready'
      and (
        (s.kind::text = 'evidence' and y.starts_on <= p_cycle_start and (s.template_family_id is null or s.template_family_id = p_family))
        or (s.kind::text = 'prior_submission' and s.template_family_id = p_family and y.starts_on < p_cycle_start)
      )
      and s.active_embedding_profile = p_profile
      and c.embedding_profile = p_profile and c.embedding_v2 is not null
  ), vector_rank as (
    select source_kind, id, row_number() over (partition by source_kind order by embedding_v2 <=> p_embedding, id) as rank
    from eligible
  ), text_rank as (
    select source_kind, id, row_number() over (partition by source_kind order by ts_rank_cd(search_vector, websearch_to_tsquery('english', p_query)) desc, id) as rank
    from eligible where search_vector @@ websearch_to_tsquery('english', p_query)
  ), ranks as (
    select source_kind, id, sum(1.0 / (60 + rank))::double precision as score
    from (select * from vector_rank where rank <= 40 union all select * from text_rank where rank <= 40) candidates
    group by source_kind, id
  ), scored as (
    select e.*, ranks.score, row_number() over (partition by e.source_kind order by ranks.score desc, e.id) as source_rank
    from ranks join eligible e using (source_kind, id)
  )
  select e.source_kind, e.source_id, e.ordinal, e.content, e.locator, e.title, e.score
  from scored e where e.source_rank <= 12
  order by e.source_kind, e.score desc, e.id;
$$;

revoke all on function public.search_template_drafting_context(text, extensions.vector, text, date, uuid, date) from public, anon;
grant execute on function public.search_template_drafting_context(text, extensions.vector, text, date, uuid, date) to authenticated, service_role;

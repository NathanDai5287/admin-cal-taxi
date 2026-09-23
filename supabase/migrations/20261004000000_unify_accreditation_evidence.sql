-- Chapter evidence and official guidelines share one accreditation source class.
-- Rename the existing enum value so the new value is usable in this transaction.
alter type public.accreditation_source_kind rename value 'chapter_evidence' to 'evidence';

update public.accreditation_sources
set kind = 'evidence'
where kind = 'official_guideline';

-- Keep the old enum label only for PostgreSQL compatibility; reject new rows.
alter table public.accreditation_sources
  add constraint accreditation_sources_unified_evidence_kind
  check (kind <> 'official_guideline');

update public.accreditation_report_definitions as definition
set required_sources = (
  select coalesce(jsonb_agg(classes.kind order by classes.first_position), '[]'::jsonb)
  from (
    select
      case when item.value in ('official_guideline', 'chapter_evidence') then 'evidence' else item.value end as kind,
      min(item.position) as first_position
    from jsonb_array_elements_text(definition.required_sources) with ordinality as item(value, position)
    group by case when item.value in ('official_guideline', 'chapter_evidence') then 'evidence' else item.value end
  ) as classes
)
where required_sources ?| array['official_guideline', 'chapter_evidence'];

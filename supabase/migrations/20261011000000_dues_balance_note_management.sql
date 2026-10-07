-- Keep note mutations separate from charge amounts, payments, and versions.
create function public.manage_receivable_note(
  p_receivable_id uuid, p_note_id uuid, p_original_body text,
  p_action text, p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.chapter_receivable_notes%rowtype;
  note_body text := btrim(p_body);
begin
  if not public.is_admin() or auth.uid() is null then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('edit', 'delete') then
    raise exception 'Choose edit or delete' using errcode = '22023';
  end if;
  if p_action = 'edit' and (note_body is null or char_length(note_body) not between 1 and 2000) then
    raise exception 'Write a note between 1 and 2000 characters' using errcode = '22023';
  end if;
  perform id from public.chapter_receivables
    where id = p_receivable_id and waived_at is null for update;
  if not found then
    raise exception 'This balance is no longer available. Refresh and try again' using errcode = '40001';
  end if;
  select * into existing from public.chapter_receivable_notes
    where id = p_note_id and receivable_id = p_receivable_id for update;
  if not found or existing.body is distinct from p_original_body then
    raise exception 'This note changed or was deleted in another session. Refresh and try again' using errcode = '40001';
  end if;
  if p_action = 'delete' then
    delete from public.chapter_receivable_notes where id = p_note_id;
  else
    update public.chapter_receivable_notes set body = note_body where id = p_note_id;
  end if;
  return p_note_id;
end;
$$;

revoke all on function public.manage_receivable_note(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.manage_receivable_note(uuid, uuid, text, text, text) to authenticated;

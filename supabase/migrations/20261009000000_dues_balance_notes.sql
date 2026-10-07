create table public.chapter_receivable_notes (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.chapter_receivables(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_by uuid references public.profiles(id) on delete set null,
  author_name text not null,
  created_at timestamptz not null default now()
);

create index chapter_receivable_notes_balance_idx
  on public.chapter_receivable_notes (receivable_id, created_at desc, id);

alter table public.chapter_receivable_notes enable row level security;
revoke all on public.chapter_receivable_notes from public, anon, authenticated;
grant select on public.chapter_receivable_notes to authenticated;
create policy "admins can view balance notes"
  on public.chapter_receivable_notes for select to authenticated
  using (public.is_admin());

create function public.add_receivable_note(p_receivable_id uuid, p_body text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  note_body text := btrim(p_body);
  note_author text;
  existing public.chapter_receivable_notes%rowtype;
begin
  if not public.is_admin() or auth.uid() is null then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_request_id is null or note_body is null or char_length(note_body) not between 1 and 2000 then
    raise exception 'Write a note between 1 and 2000 characters' using errcode = '22023';
  end if;

  -- Serialize against waivers without changing the charge's version or payments.
  perform id from public.chapter_receivables
    where id = p_receivable_id and waived_at is null for update;
  if not found then
    raise exception 'This balance is no longer available. Refresh and try again' using errcode = '40001';
  end if;
  select coalesce(nullif(btrim(full_name), ''), nullif(email, ''), 'Administrator')
    into note_author from public.profiles where id = auth.uid();

  insert into public.chapter_receivable_notes (id, receivable_id, body, created_by, author_name)
  values (p_request_id, p_receivable_id, note_body, auth.uid(), coalesce(note_author, 'Administrator'))
  on conflict (id) do nothing;
  if not found then
    select * into existing from public.chapter_receivable_notes where id = p_request_id;
    if existing.receivable_id is distinct from p_receivable_id
      or existing.body is distinct from note_body
      or existing.created_by is distinct from auth.uid() then
      raise exception 'This note request has already been used' using errcode = '22023';
    end if;
  end if;
  return p_request_id;
end;
$$;

revoke all on function public.add_receivable_note(uuid, text, uuid) from public, anon;
grant execute on function public.add_receivable_note(uuid, text, uuid) to authenticated;

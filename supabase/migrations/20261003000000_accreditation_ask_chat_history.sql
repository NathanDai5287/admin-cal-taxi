create table public.accreditation_ask_chats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accreditation_ask_chats_owner_updated_idx
  on public.accreditation_ask_chats (owner_id, updated_at desc);

create table public.accreditation_ask_turns (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.accreditation_ask_chats(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  question text not null check (char_length(trim(question)) between 1 and 4000),
  answer text not null check (char_length(trim(answer)) between 1 and 8000),
  attachment_names text[] not null default '{}',
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  follow_ups text[] not null default '{}',
  policy_used boolean not null default false,
  policy_date date,
  created_at timestamptz not null default now(),
  unique (chat_id, turn_number)
);

create index accreditation_ask_turns_chat_number_idx
  on public.accreditation_ask_turns (chat_id, turn_number);

alter table public.accreditation_ask_chats enable row level security;
alter table public.accreditation_ask_turns enable row level security;

grant select, delete on public.accreditation_ask_chats to authenticated;
grant select on public.accreditation_ask_turns to authenticated;

create policy accreditation_ask_chats_owner_read_delete
  on public.accreditation_ask_chats for select to authenticated
  using (public.is_admin() and owner_id = auth.uid());

create policy accreditation_ask_chats_owner_delete
  on public.accreditation_ask_chats for delete to authenticated
  using (public.is_admin() and owner_id = auth.uid());

create policy accreditation_ask_turns_owner_read
  on public.accreditation_ask_turns for select to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.accreditation_ask_chats c
      where c.id = chat_id and c.owner_id = auth.uid()
    )
  );

create function public.save_accreditation_ask_turn(
  p_chat_id uuid,
  p_question text,
  p_answer text,
  p_attachment_names text[],
  p_sources jsonb,
  p_follow_ups text[],
  p_policy_used boolean,
  p_policy_date date
) returns table (
  saved_chat_id uuid,
  saved_turn_id uuid,
  saved_turn_number integer,
  saved_title text,
  saved_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat_id uuid;
  v_turn_id uuid;
  v_turn_number integer;
  v_title text;
  v_updated_at timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_question is null or char_length(trim(p_question)) not between 1 and 4000
    or p_answer is null or char_length(trim(p_answer)) not between 1 and 8000
    or p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    raise exception 'Invalid chat turn';
  end if;

  if p_chat_id is null then
    v_title := left(trim(p_question), 120);
    insert into public.accreditation_ask_chats (owner_id, title)
      values (auth.uid(), v_title)
      returning id, title into v_chat_id, v_title;
  else
    select c.id, c.title into v_chat_id, v_title
      from public.accreditation_ask_chats c
      where c.id = p_chat_id and c.owner_id = auth.uid()
      for update;
    if not found then
      raise exception 'Chat not found';
    end if;
  end if;

  select coalesce(max(t.turn_number), 0) + 1 into v_turn_number
    from public.accreditation_ask_turns t where t.chat_id = v_chat_id;

  insert into public.accreditation_ask_turns (
    chat_id, turn_number, question, answer, attachment_names, sources,
    follow_ups, policy_used, policy_date
  ) values (
    v_chat_id, v_turn_number, trim(p_question), trim(p_answer),
    coalesce(p_attachment_names, '{}'), p_sources,
    coalesce(p_follow_ups, '{}'), coalesce(p_policy_used, false), p_policy_date
  ) returning id into v_turn_id;

  update public.accreditation_ask_chats
    set updated_at = now()
    where id = v_chat_id
    returning updated_at into v_updated_at;

  return query select v_chat_id, v_turn_id, v_turn_number, v_title, v_updated_at;
end;
$$;

revoke all on function public.save_accreditation_ask_turn(uuid, text, text, text[], jsonb, text[], boolean, date)
  from public, anon, authenticated;
grant execute on function public.save_accreditation_ask_turn(uuid, text, text, text[], jsonb, text[], boolean, date)
  to authenticated;

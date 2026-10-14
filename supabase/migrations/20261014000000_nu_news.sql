create table public.nu_news_issues (
  id uuid primary key default gen_random_uuid(),
  season text not null check (char_length(btrim(season)) between 1 and 60),
  issue_date date not null default current_date,
  location text not null default 'Berkeley, CA',
  intro jsonb not null default '{"heading": "", "body": ""}',
  articles jsonb not null default '[]',
  cover_src text,
  gallery jsonb not null default '[]',
  donate jsonb not null,
  preview_made_at timestamptz,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id),
  finalized_by_name text,
  final_pdf_path text unique,
  final_pdf_sha256 text,
  final_inputs jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (finalized_at is null and finalized_by is null and finalized_by_name is null
      and final_pdf_path is null and final_pdf_sha256 is null and final_inputs is null)
    or (finalized_at is not null and finalized_by is not null and finalized_by_name is not null
      and final_pdf_path is not null and final_pdf_sha256 ~ '^[0-9a-f]{64}$' and final_inputs is not null)
  )
);

create trigger nu_news_issues_set_updated_at
  before update on public.nu_news_issues
  for each row execute procedure public.set_updated_at();

create function public.nu_news_issues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.finalized_at is not null then
    raise exception 'Finalized Nu News issues are immutable' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger nu_news_issues_guard
  before update or delete on public.nu_news_issues
  for each row execute procedure public.nu_news_issues_guard();

alter table public.nu_news_issues enable row level security;
revoke all on public.nu_news_issues from public, anon, authenticated;
grant select, insert, update, delete on public.nu_news_issues to authenticated;
create policy "admins manage nu news issues"
  on public.nu_news_issues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nu-news', 'nu-news', false, 50 * 1024 * 1024, array['image/jpeg', 'application/pdf']);

create policy "admins manage nu news files"
  on storage.objects for all to authenticated
  using (bucket_id = 'nu-news' and public.is_admin())
  with check (bucket_id = 'nu-news' and public.is_admin());

-- The service role skips storage policies, so a trigger keeps finalized files for every role.
create function public.nu_news_final_files_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.bucket_id = 'nu-news' and exists (
    select 1 from public.nu_news_issues
    where final_pdf_path = old.name or final_inputs -> 'photos' ? old.name
  ) then
    raise exception 'Files of a finalized Nu News issue are immutable' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger nu_news_final_files_guard
  before update or delete on storage.objects
  for each row execute procedure public.nu_news_final_files_guard();

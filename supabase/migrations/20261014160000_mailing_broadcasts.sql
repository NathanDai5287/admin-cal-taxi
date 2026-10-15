begin;

create table public.mailing_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  recipients jsonb not null check (jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.mailing_broadcasts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  list_id uuid references public.mailing_lists(id),
  newsletter_id uuid references public.nu_news_issues(id),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 50000),
  reply_to text not null default '',
  postal_address text not null default '' check (char_length(postal_address) <= 500),
  status text not null default 'draft' check (status in ('draft','preparing','ready','sending','sent','review')),
  segment_id text, import_id text, resend_id text,
  recipient_count integer not null default 0,
  sender text not null default '',
  error text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger mailing_lists_updated_at before update on public.mailing_lists for each row execute function public.set_updated_at();
create trigger mailing_broadcasts_updated_at before update on public.mailing_broadcasts for each row execute function public.set_updated_at();
alter table public.mailing_lists enable row level security;
alter table public.mailing_broadcasts enable row level security;
revoke all on public.mailing_lists, public.mailing_broadcasts from public, anon, authenticated;
grant select on public.mailing_lists, public.mailing_broadcasts to authenticated;
grant all on public.mailing_lists, public.mailing_broadcasts to service_role;
create policy "app readers read mailing lists" on public.mailing_lists for select to authenticated using (public.has_app_access('mailing-list', 'read'));
create policy "app readers read broadcasts" on public.mailing_broadcasts for select to authenticated using (public.has_app_access('mailing-list', 'read'));

create function public.mailing_broadcast_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'sent' then raise exception 'Sent broadcasts are finalized and immutable' using errcode = '22023'; end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Prepared broadcasts cannot be deleted' using errcode = '22023'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (
    new.status = 'draft' or
    row(new.name,new.list_id,new.newsletter_id,new.subject,new.body,new.reply_to,new.postal_address,new.recipient_count,new.sender)
      is distinct from row(old.name,old.list_id,old.newsletter_id,old.subject,old.body,old.reply_to,old.postal_address,old.recipient_count,old.sender)
  ) then raise exception 'Prepared broadcast content is immutable' using errcode = '22023'; end if;
  if new.status = 'sent' then new.finalized_at = now(); end if;
  return new;
end; $$;
create trigger mailing_broadcast_guard before update or delete on public.mailing_broadcasts for each row execute function public.mailing_broadcast_guard();

-- Public routes consult this allow-list through the server; source drafts and storage stay private.
create table public.nu_news_publications (
  issue_id uuid primary key references public.nu_news_issues(id),
  published_at timestamptz not null default now()
);
alter table public.nu_news_publications enable row level security;
revoke all on public.nu_news_publications from public, anon, authenticated;
grant all on public.nu_news_publications to service_role;

create function public.sent_newsletter_link_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.mailing_broadcasts where newsletter_id = old.issue_id and status = 'sent') then
    raise exception 'A sent newsletter link is immutable' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger sent_newsletter_link_guard before update or delete on public.nu_news_publications for each row execute function public.sent_newsletter_link_guard();

create table public.newsletter_events (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.nu_news_publications(issue_id),
  broadcast_id uuid references public.mailing_broadcasts(id),
  kind text not null check (kind in ('page_view','pdf_open','pdf_download')),
  visitor_id uuid not null,
  occurred_at timestamptz not null default now()
);
create index newsletter_events_broadcast_idx on public.newsletter_events(broadcast_id, occurred_at);
create index newsletter_events_issue_idx on public.newsletter_events(issue_id, occurred_at);
alter table public.newsletter_events enable row level security;
revoke all on public.newsletter_events from public, anon, authenticated;
grant select, insert on public.newsletter_events to service_role;
grant usage, select on sequence public.newsletter_events_id_seq to service_role;

insert into public.mailing_broadcasts (id, name, subject, body) values (
  '778ed178-cd4b-4f39-8fe7-44f81e52a8ec', 'October 2026 Nu News', 'Theta Xi Nu News! (Fall 2026) October',
  $body$Dear Brothers and Friends of Theta Xi,

 We’re excited to share our October 2026 edition of Nu News, our chapter’s long standing newsletter tradition. This issue features writings from our brothers on how they built new connections and friendships with fellow Theta Xi, both here in Berkeley and across the country.

     Whether you’re an alum, current member, or friend of Nu Chapter, we hope you enjoy reading and staying connected. Thank you for being part of our community. We’re proud to continue this tradition and look forward to sharing more updates from the chapter in future newsletters.
     You can read the newsletter using the link below. If you have any questions or concerns, you may reply to this email and I will get back to you as soon as possible.

YITB
Sean F. Islandhouse, Nu 1057
Secretary of the Nu Chapter$body$
);

notify pgrst, 'reload schema';
commit;

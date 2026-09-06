create type public.chapter_income_source as enum (
  'active_member_dues',
  'new_member_fees',
  'fundraising',
  'alumni_donations',
  'other'
);

alter table public.reimbursement_budget_entries
  add column source public.chapter_income_source not null default 'other';

create index reimbursement_budget_entries_source_date_idx
  on public.reimbursement_budget_entries (source, budget_date desc);

create table public.chapter_financial_settings (
  id boolean primary key default true check (id),
  chapter_name text not null default 'Theta Xi' check (char_length(chapter_name) between 1 and 120),
  term_label text not null check (char_length(term_label) between 1 and 120),
  term_start date not null,
  term_end date not null,
  opening_cash numeric(12, 2) not null default 0 check (opening_cash >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (term_end >= term_start)
);

insert into public.chapter_financial_settings (id, term_label, term_start, term_end)
select
  true,
  case
    when extract(month from current_date) >= 8 then 'Fall ' || extract(year from current_date)::int
    else 'Spring ' || extract(year from current_date)::int
  end,
  case
    when extract(month from current_date) >= 8 then make_date(extract(year from current_date)::int, 8, 1)
    else make_date(extract(year from current_date)::int, 1, 1)
  end,
  case
    when extract(month from current_date) >= 8 then make_date(extract(year from current_date)::int, 12, 31)
    else make_date(extract(year from current_date)::int, 7, 31)
  end;

create trigger chapter_financial_settings_set_updated_at
  before update on public.chapter_financial_settings
  for each row execute procedure public.set_updated_at();

create table public.chapter_receivables (
  id uuid primary key default gen_random_uuid(),
  member_name text not null check (char_length(member_name) between 1 and 120),
  amount_assessed numeric(12, 2) not null check (amount_assessed > 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0 and amount_paid <= amount_assessed),
  due_date date not null,
  notes text not null default '' check (char_length(notes) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chapter_receivables_due_date_idx
  on public.chapter_receivables (due_date, member_name);

create trigger chapter_receivables_set_updated_at
  before update on public.chapter_receivables
  for each row execute procedure public.set_updated_at();

revoke all on public.chapter_financial_settings from anon, authenticated;
grant select, insert, update on public.chapter_financial_settings to authenticated;
alter table public.chapter_financial_settings enable row level security;

create policy "admins can view chapter financial settings"
  on public.chapter_financial_settings for select to authenticated
  using (public.is_admin());
create policy "admins can create chapter financial settings"
  on public.chapter_financial_settings for insert to authenticated
  with check (public.is_admin() and updated_by = auth.uid());
create policy "admins can update chapter financial settings"
  on public.chapter_financial_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());

revoke all on public.chapter_receivables from anon, authenticated;
grant select, insert, update, delete on public.chapter_receivables to authenticated;
alter table public.chapter_receivables enable row level security;

create policy "admins can view chapter receivables"
  on public.chapter_receivables for select to authenticated
  using (public.is_admin());
create policy "admins can create chapter receivables"
  on public.chapter_receivables for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());
create policy "admins can update chapter receivables"
  on public.chapter_receivables for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "admins can delete chapter receivables"
  on public.chapter_receivables for delete to authenticated
  using (public.is_admin());

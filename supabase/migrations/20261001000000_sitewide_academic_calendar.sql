-- Promote Accreditation's calendar into a shared site-wide calendar. Existing
-- IDs are preserved, so accreditation records keep their relationships while
-- Finance and Members can reference the same academic terms.

alter table public.accreditation_cycles rename to academic_years;
alter table public.accreditation_terms rename to academic_terms;

alter table public.chapter_financial_settings
  add column academic_term_id uuid references public.academic_terms(id) on delete restrict;

create or replace function public.sync_chapter_financial_academic_term()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  selected_term public.academic_terms%rowtype;
begin
  if new.academic_term_id is null then
    return new;
  end if;

  select * into selected_term
  from public.academic_terms
  where id = new.academic_term_id;

  if not found then
    raise exception 'Academic term not found';
  end if;

  new.term_label := selected_term.label;
  new.term_start := selected_term.starts_on;
  new.term_end := selected_term.ends_on;
  return new;
end;
$$;

create trigger chapter_financial_settings_sync_academic_term
  before insert or update on public.chapter_financial_settings
  for each row execute procedure public.sync_chapter_financial_academic_term();

-- Connect the existing Finance term. Prefer an exact term, then a matching
-- season in a containing academic year, and create the missing calendar rows
-- only when Accreditation did not already define them.
do $$
declare
  settings record;
  academic_year_id uuid;
  selected_term_id uuid;
  term_season text;
  first_year integer;
  year_label text;
  academic_year_start date;
  academic_year_end date;
begin
  select * into settings from public.chapter_financial_settings where id = true;
  if not found then
    return;
  end if;

  select id into selected_term_id
  from public.academic_terms
  where starts_on = settings.term_start and ends_on = settings.term_end
  order by created_at
  limit 1;

  if selected_term_id is null then
    term_season := case when extract(month from settings.term_start) >= 7 then 'fall' else 'spring' end;

    select id into academic_year_id
    from public.academic_years
    where starts_on <= settings.term_start and ends_on >= settings.term_end
    order by starts_on desc
    limit 1;

    if academic_year_id is null then
      first_year := case
        when term_season = 'fall' then extract(year from settings.term_start)::integer
        else extract(year from settings.term_start)::integer - 1
      end;
      year_label := first_year::text || '-' || (first_year + 1)::text;
      academic_year_start := make_date(first_year, 7, 1);
      academic_year_end := make_date(first_year + 1, 6, 30);

      select id into academic_year_id
      from public.academic_years
      where label = year_label;

      if academic_year_id is null then
        insert into public.academic_years (label, starts_on, ends_on)
        values (year_label, academic_year_start, academic_year_end)
        returning id into academic_year_id;
      end if;
    end if;

    select id into selected_term_id
    from public.academic_terms
    where cycle_id = academic_year_id and season = term_season;

    if selected_term_id is null then
      insert into public.academic_terms (cycle_id, season, label, starts_on, ends_on)
      values (academic_year_id, term_season, settings.term_label, settings.term_start, settings.term_end)
      returning id into selected_term_id;
    end if;
  end if;

  update public.chapter_financial_settings
  set academic_term_id = selected_term_id
  where id = true;
end;
$$;

alter table public.chapter_financial_settings
  alter column academic_term_id set not null;

alter table public.profiles
  add column member_since_term_id uuid references public.academic_terms(id) on delete set null;

create index profiles_member_since_term_idx
  on public.profiles (member_since_term_id)
  where removed_at is null;

create or replace function public.admin_set_profile_academic_term(
  target_user_id uuid,
  new_academic_term_id uuid
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change member academic terms';
  end if;
  if new_academic_term_id is not null and not exists (
    select 1 from public.academic_terms where id = new_academic_term_id
  ) then
    raise exception 'academic term not found';
  end if;

  update public.profiles
  set member_since_term_id = new_academic_term_id
  where id = target_user_id and removed_at is null;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

revoke all on function public.admin_set_profile_academic_term(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_profile_academic_term(uuid, uuid) to authenticated;

drop function public.admin_invite_email(text, public.app_role);
create function public.admin_invite_email(
  invite_email text,
  invite_role public.app_role,
  invite_member_since_term_id uuid default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_email text := lower(trim(invite_email));
  profile_has_signed_in boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can invite users';
  end if;
  if invite_role not in ('member', 'admin') then
    raise exception 'invites must be for member or admin';
  end if;
  if normalized_email = '' then
    raise exception 'invite email is required';
  end if;
  if invite_member_since_term_id is not null and not exists (
    select 1 from public.academic_terms where id = invite_member_since_term_id
  ) then
    raise exception 'academic term not found';
  end if;

  update public.profiles
  set role = invite_role,
      removed_at = null,
      member_since_term_id = coalesce(invite_member_since_term_id, member_since_term_id)
  where lower(email) = normalized_email
  returning has_signed_in into profile_has_signed_in;

  if found and profile_has_signed_in then
    delete from public.invites where email = normalized_email;
    return;
  end if;

  if not found then
    insert into public.profiles (id, full_name, email, role, has_signed_in, member_since_term_id)
    values (gen_random_uuid(), '', normalized_email, invite_role, false, invite_member_since_term_id);
  end if;

  insert into public.invites (email, role, invited_by)
  values (normalized_email, invite_role, auth.uid())
  on conflict (email) do update
  set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
end;
$$;

revoke all on function public.admin_invite_email(text, public.app_role, uuid) from public, anon, authenticated;
grant execute on function public.admin_invite_email(text, public.app_role, uuid) to authenticated;

-- Read/write compatibility for older clients. Both views target the shared
-- tables; security_invoker keeps the base tables' admin-only RLS in force.
create view public.accreditation_cycles
with (security_invoker = true)
as select * from public.academic_years;

create view public.accreditation_terms
with (security_invoker = true)
as select * from public.academic_terms;

grant select, insert, update, delete on public.accreditation_cycles to authenticated;
grant select, insert, update, delete on public.accreditation_terms to authenticated;

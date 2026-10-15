create table public.mailing_list_contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  email text not null default '' check (char_length(email) <= 254 and email = lower(btrim(email)) and (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text not null default '' check (char_length(phone) <= 60 and (phone = '' or (phone ~ '^[+()0-9[:space:].xXeEtT#-]+$' and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 20))),
  phone_digits text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  contact_key text generated always as (case when email <> '' then 'email:' || email else 'phone:' || regexp_replace(phone, '[^0-9]', '', 'g') end) stored unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email <> '' or phone <> '')
);

create index mailing_list_contacts_name_idx on public.mailing_list_contacts (last_name, first_name, id);
create trigger mailing_list_contacts_updated_at before update on public.mailing_list_contacts
  for each row execute function public.set_updated_at();

alter table public.mailing_list_contacts enable row level security;
revoke all on public.mailing_list_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.mailing_list_contacts to authenticated;
grant all on public.mailing_list_contacts to service_role;
create policy "admins manage mailing list" on public.mailing_list_contacts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- One transaction: retries skip existing identities and never overwrite contact details.
create function public.import_mailing_list_contacts(contacts jsonb) returns integer
language plpgsql set search_path = '' as $$
declare inserted_count integer;
begin
  if contacts is null or jsonb_typeof(contacts) <> 'array' then
    raise exception 'Import a contact array' using errcode = '22023';
  end if;
  if jsonb_array_length(contacts) not between 1 and 10000 then
    raise exception 'Import between 1 and 10000 contacts' using errcode = '22023';
  end if;
  insert into public.mailing_list_contacts (first_name, last_name, email, phone)
  select btrim(c.first_name), btrim(coalesce(c.last_name, '')), lower(btrim(coalesce(c.email, ''))), btrim(coalesce(c.phone, ''))
  from jsonb_to_recordset(contacts) as c(first_name text, last_name text, email text, phone text)
  on conflict (contact_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.import_mailing_list_contacts(jsonb) from public, anon, authenticated;
grant execute on function public.import_mailing_list_contacts(jsonb) to service_role;

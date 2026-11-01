-- Itemized security-deposit settlements and their private evidence.
-- Existing payment, order, signing, and email records remain untouched.

create table public.hosting_damage_settlements (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.hosting_finance_orders(order_id),
  deposit_amount numeric(12,2) not null check (deposit_amount > 0),
  refund_method text not null default '' check (char_length(refund_method) <= 120),
  refund_date date,
  status text not null default 'draft' check (status in ('draft','sent','returned')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notice_sent_at timestamptz,
  returned_at timestamptz,
  credit_memo jsonb,
  check (status = 'draft' or (refund_date is not null and length(trim(refund_method)) > 0))
);

-- A fully retained deposit is a completed settlement with a zero-dollar
-- return, not a missing return record.
alter table public.hosting_event_state drop constraint if exists hosting_event_state_refund_amount_check;
alter table public.hosting_event_state add constraint hosting_event_state_refund_amount_check check (refund_amount >= 0);

create or replace function public.hosting_club_key(value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(lower(trim(coalesce(value,''))), '[^a-z0-9]+', '', 'g')
$$;

create table public.hosting_damage_items (
  id uuid primary key,
  settlement_id uuid not null references public.hosting_damage_settlements(id) on delete cascade,
  category text not null check (category in ('damage','plumbing','cleaning','missing_property','other')),
  description text not null check (char_length(trim(description)) between 1 and 500),
  amount numeric(12,2) not null check (amount > 0),
  responsible_clubs text[] not null check (cardinality(responsible_clubs) between 1 and 20),
  responsible_club_keys text[] not null check (cardinality(responsible_club_keys) between 1 and 20),
  position integer not null check (position between 0 and 99),
  created_at timestamptz not null default now()
);

create index hosting_damage_items_settlement_idx on public.hosting_damage_items(settlement_id, position);
create index hosting_damage_items_clubs_idx on public.hosting_damage_items using gin(responsible_clubs);
create index hosting_damage_items_club_keys_idx on public.hosting_damage_items using gin(responsible_club_keys);

create table public.hosting_damage_evidence (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.hosting_damage_settlements(id) on delete cascade,
  item_id uuid references public.hosting_damage_items(id) on delete set null,
  storage_path text not null unique,
  filename text not null check (char_length(filename) between 1 and 240),
  content_type text not null check (content_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 10485760),
  caption text not null default '' check (char_length(caption) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index hosting_damage_evidence_settlement_idx on public.hosting_damage_evidence(settlement_id, created_at);

alter table public.hosting_damage_settlements enable row level security;
alter table public.hosting_damage_items enable row level security;
alter table public.hosting_damage_evidence enable row level security;
revoke all on public.hosting_damage_settlements, public.hosting_damage_items,
  public.hosting_damage_evidence from public, anon, authenticated;
grant all on public.hosting_damage_settlements, public.hosting_damage_items,
  public.hosting_damage_evidence to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('hosting-damage-evidence', 'hosting-damage-evidence', false, 10485760, array['image/jpeg'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- The authenticated app prepares short-lived signed upload URLs. Evidence is
-- never exposed through a public bucket or direct authenticated-client policy.

create or replace function public.save_hosting_damage_settlement(
  p_order_id text,
  p_deposit_amount numeric,
  p_refund_method text,
  p_refund_date date,
  p_items jsonb,
  p_user_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  settlement public.hosting_damage_settlements;
  item jsonb;
  item_total numeric := 0;
  item_id uuid;
  item_amount numeric;
  item_clubs text[];
  item_club_keys text[];
  kept_ids uuid[] := array[]::uuid[];
begin
  if not exists(select 1 from public.profiles where id = p_user_id and removed_at is null) then
    raise exception 'Active user required';
  end if;
  if p_order_id is null or length(p_order_id) > 200 or p_deposit_amount is null or p_deposit_amount <= 0 then
    raise exception 'Invalid settlement order or deposit';
  end if;
  if not exists(select 1 from public.hosting_finance_orders where order_id = p_order_id and status = 'confirmed') then
    raise exception 'Only an active sent event can have a deposit settlement';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 25 then
    raise exception 'Add between 1 and 25 deductions';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hosting_damage/' || p_order_id, 0));
  select * into settlement from public.hosting_damage_settlements where order_id = p_order_id;
  if found and settlement.status <> 'draft' then
    raise exception 'A sent settlement is immutable; create a correction instead';
  end if;

  if not found then
    insert into public.hosting_damage_settlements(order_id, deposit_amount, refund_method, refund_date, created_by, updated_by)
      values(p_order_id, p_deposit_amount, trim(coalesce(p_refund_method,'')), p_refund_date, p_user_id, p_user_id)
      returning * into settlement;
  else
    update public.hosting_damage_settlements set
      deposit_amount = p_deposit_amount,
      refund_method = trim(coalesce(p_refund_method,'')),
      refund_date = p_refund_date,
      revision = revision + 1,
      updated_by = p_user_id,
      updated_at = now()
    where id = settlement.id returning * into settlement;
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    begin item_id := (item->>'id')::uuid; exception when others then raise exception 'Invalid deduction ID'; end;
    begin item_amount := (item->>'amount')::numeric; exception when others then raise exception 'Invalid deduction amount'; end;
    select coalesce(array_agg(distinct trim(value)), array[]::text[]) into item_clubs
      from jsonb_array_elements_text(coalesce(item->'clubs','[]'::jsonb)) where length(trim(value)) > 0;
    select coalesce(array_agg(distinct public.hosting_club_key(value)), array[]::text[]) into item_club_keys
      from unnest(item_clubs) value where length(public.hosting_club_key(value)) > 0;
    if item_amount <= 0 or char_length(trim(coalesce(item->>'description',''))) not between 1 and 500
      or coalesce(item->>'category','') not in ('damage','plumbing','cleaning','missing_property','other')
      or cardinality(item_clubs) not between 1 and 20 then
      raise exception 'Each deduction needs a category, description, positive amount, and responsible club';
    end if;
    if exists(select 1 from public.hosting_damage_items where id = item_id and settlement_id <> settlement.id) then
      raise exception 'A deduction ID belongs to another settlement';
    end if;
    item_total := item_total + item_amount;
    insert into public.hosting_damage_items(id, settlement_id, category, description, amount, responsible_clubs, responsible_club_keys, position)
      values(item_id, settlement.id, item->>'category', trim(item->>'description'), item_amount, item_clubs, item_club_keys, (item->>'position')::integer)
      on conflict(id) do update set category=excluded.category, description=excluded.description,
        amount=excluded.amount, responsible_clubs=excluded.responsible_clubs,
        responsible_club_keys=excluded.responsible_club_keys, position=excluded.position;
    kept_ids := array_append(kept_ids, item_id);
  end loop;
  if item_total > p_deposit_amount then
    raise exception 'Deductions cannot exceed the recorded deposit';
  end if;
  delete from public.hosting_damage_items where settlement_id = settlement.id and not (id = any(kept_ids));
  return settlement.id;
end; $$;
revoke all on function public.save_hosting_damage_settlement(text,numeric,text,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_hosting_damage_settlement(text,numeric,text,date,jsonb,uuid) to service_role;

alter table public.hosting_email_deliveries drop constraint hosting_email_deliveries_kind_check;
alter table public.hosting_email_deliveries add constraint hosting_email_deliveries_kind_check
  check(kind in ('invitation','reminder','completed','deposit_invoice','rental_invoice','deposit_receipt','receipt','refund','settlement'));

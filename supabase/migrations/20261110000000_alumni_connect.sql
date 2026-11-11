-- Alumni Connect uses the existing person identity. Only server-side code can
-- access invitation credentials; public forms never get direct table grants.
alter table public.profiles
  add column first_name text not null default '' check (char_length(first_name) <= 100),
  add column last_name text not null default '' check (char_length(last_name) <= 100),
  add column roll_number text not null default '' check (roll_number = '' or roll_number ~ '^Nu [1-9][0-9]{0,6}$'),
  add column graduation_year integer check (graduation_year between 1900 and 2200),
  add column connect_only boolean not null default false;

-- A self-service mailing signup is not proof of chapter membership. Keep the
-- shared Alumni classification, but cap unvetted profiles to newsletter reading.
create or replace function public.get_my_app_access()
returns table (app_key text, access_level text)
language sql stable security definer set search_path = '' as $$
  select permission.app_key,
    case max(case when person.connect_only then case when permission.access_level <> 'none' then 1 else 0 end
      else case permission.access_level when 'write' then 2 when 'read' then 1 else 0 end end)
    when 2 then 'write' when 1 then 'read' else 'none' end
  from public.role_app_access permission join public.profiles person on person.id = auth.uid()
    and person.removed_at is null and coalesce(auth.jwt()->>'client_id','') = ''
    and (not person.connect_only or permission.app_key = 'nu-news')
    and case when public.view_as_roles() is null then
      permission.role_key = person.role::text or permission.role_key = person.membership
      or permission.role_key = any(person.executive_roles)
      or (permission.role_key = 'exec_member' and cardinality(person.executive_roles)>0)
    else permission.role_key = any(public.view_as_roles()) end
  group by permission.app_key;
$$;
create or replace function public.has_mcp_app_access(app_key text, required_access text default 'read')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles person join public.role_app_access permission on
    permission.role_key = person.role::text or permission.role_key = person.membership
    or permission.role_key = any(person.executive_roles)
    or (permission.role_key = 'exec_member' and cardinality(person.executive_roles)>0)
    where person.id = auth.uid() and person.removed_at is null and coalesce(auth.jwt()->>'client_id','') <> ''
    and permission.app_key = has_mcp_app_access.app_key and required_access in ('read','write')
    and (not person.connect_only or (permission.app_key = 'nu-news' and required_access = 'read'))
    and (permission.access_level = 'write' or (required_access = 'read' and permission.access_level = 'read')));
$$;

create function public.connect_valid_defaults(value jsonb) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object' and value - array['first_name','last_name','roll_number','graduation_year'] = '{}'::jsonb
    and (not value ? 'first_name' or (jsonb_typeof(value->'first_name') = 'string' and length(value->>'first_name') <= 100))
    and (not value ? 'last_name' or (jsonb_typeof(value->'last_name') = 'string' and length(value->>'last_name') <= 100))
    and (not value ? 'roll_number' or (jsonb_typeof(value->'roll_number') = 'string' and (value->>'roll_number' = '' or value->>'roll_number' ~ '^Nu [1-9][0-9]{0,6}$')))
    and (not value ? 'graduation_year' or value->'graduation_year' = 'null'::jsonb or
      (jsonb_typeof(value->'graduation_year') = 'number' and value->>'graduation_year' ~ '^(19|20|21)[0-9]{2}$|^2200$'));
$$;

insert into public.role_app_access(role_key, app_key, access_level)
values ('alumni', 'nu-news', 'read')
on conflict (role_key, app_key) do update set access_level = case
  when public.role_app_access.access_level = 'none' then 'read' else public.role_app_access.access_level end;

-- Read access means completed issues, including direct PostgREST/Storage
-- requests. Keep the existing permissive policies and narrow them restrictively.
create policy connect_news_completed_only on public.nu_news_issues as restrictive
for select to authenticated using (
  public.has_app_access('nu-news', 'write') or
  (public.has_app_access('nu-news', 'read') and finalized_at is not null and final_pdf_path is not null)
);
create policy connect_news_final_files_only on storage.objects as restrictive
for select to authenticated using (
  bucket_id <> 'nu-news' or public.has_app_access('nu-news', 'write') or
  (public.has_app_access('nu-news', 'read') and exists (
    select 1 from public.nu_news_issues i where i.finalized_at is not null and i.final_pdf_path = storage.objects.name
  ))
);

create table public.connect_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  defaults jsonb not null default '{}' check (public.connect_valid_defaults(defaults)),
  inviter_id uuid references public.profiles(id) on update cascade on delete set null,
  inviter_name text not null default '',
  include_name boolean not null default true,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked','suppressed')),
  delivery text not null default 'reserved' check (delivery in ('reserved','sent','uncertain','not_sent')),
  created_at timestamptz not null default now()
);
create index connect_invitations_inviter_date on public.connect_invitations(inviter_id, created_at);
create table public.connect_email_history (
  email text primary key,
  invitation_id uuid references public.connect_invitations(id) on delete restrict,
  profile_id uuid references public.profiles(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);
create table public.connect_members (
  profile_id uuid primary key references public.profiles(id) on update cascade on delete restrict,
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  subscribed boolean not null default true,
  blocked boolean not null default false,
  unsubscribe_hash text not null unique,
  suppression_pending boolean not null default false,
  admin_removed boolean not null default false,
  provider_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.connect_sessions (
  token_hash text primary key,
  profile_id uuid not null references public.profiles(id) on update cascade on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);
create table public.connect_verifications (
  token_hash text primary key,
  code_hash text not null,
  invitation_id uuid references public.connect_invitations(id) on delete cascade,
  email text not null,
  purpose text not null check (purpose in ('change','login')),
  requester_hash text,
  attempts integer not null default 0,
  verified boolean not null default false,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index connect_verifications_email_date on public.connect_verifications(email, created_at);
create index connect_verifications_invite_date on public.connect_verifications(invitation_id, created_at);

-- This list is maintained from consented subscriptions, never from referrals.
alter table public.mailing_lists drop constraint mailing_lists_recipients_check;
alter table public.mailing_lists add constraint mailing_lists_recipients_check check (
  jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) <= 10000
  and (jsonb_array_length(recipients) >= 1 or id = 'c011ec70-0000-4000-8000-000000000001')
);
insert into public.mailing_lists(id, name, recipients)
values ('c011ec70-0000-4000-8000-000000000001', 'Alumni Connect', '[]');

create function public.connect_refresh_list() returns void
language sql set search_path = '' as $$
  update public.mailing_lists set recipients = coalesce((
    select jsonb_agg(jsonb_build_object('email', m.email, 'first_name', p.first_name, 'last_name', p.last_name) order by m.email)
    from public.connect_members m join public.profiles p on p.id = m.profile_id
    where m.subscribed and not m.blocked and p.removed_at is null
  ), '[]'::jsonb) where id = 'c011ec70-0000-4000-8000-000000000001';
$$;

-- One transaction per command: row locks and the permanent email primary key
-- serialize concurrent referrals, changes, declines and acceptance.
create function public.connect_command(command text, payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  inv public.connect_invitations;
  verification public.connect_verifications;
  person public.profiles;
  actor uuid;
  recipient jsonb;
  destination text;
  result jsonb := '[]';
  created uuid;
  person_id uuid;
  original_person_id uuid;
  other_invitation uuid;
begin
  if command = 'invite' then
    actor := (payload->>'actor')::uuid;
    -- Shared advisory lock also serializes acceptance/list rebuilds. It is held
    -- only for the short DB transaction, never while sending email.
    perform pg_advisory_xact_lock(7101048);
    select * into person from public.profiles where id = actor and removed_at is null;
    if person.id is null then raise exception 'Your invitation access is unavailable'; end if;
    if not coalesce((payload->>'admin')::boolean, false) and not exists (
      select 1 from public.connect_members where profile_id = actor and subscribed and not blocked
    ) then raise exception 'Join the mailing list before inviting brothers'; end if;
    if jsonb_array_length(payload->'recipients') not between 1 and 20 then raise exception 'Invite up to 20 people at a time'; end if;
    if (select count(*) from public.connect_invitations where inviter_id = actor and created_at > now() - interval '1 day')
      + jsonb_array_length(payload->'recipients') > 50 then raise exception 'Daily invitation limit reached. Try again tomorrow'; end if;
    for recipient in select value from jsonb_array_elements(payload->'recipients') loop
      destination := lower(btrim(recipient->>'email'));
      if exists (select 1 from public.connect_email_history where email = destination)
        or exists (select 1 from public.connect_members where email = destination)
        or exists (select 1 from public.mailing_lists l, jsonb_array_elements(l.recipients) r where lower(btrim(r->>'email')) = destination)
        then continue; end if;
      insert into public.connect_invitations(token_hash, email, defaults, inviter_id, inviter_name, include_name)
      values (recipient->>'token_hash', destination, recipient->'defaults', actor, person.full_name, (payload->>'include_name')::boolean)
      returning id into created;
      insert into public.connect_email_history(email, invitation_id) values (destination, created);
      result := result || jsonb_build_array(jsonb_build_object('id', created, 'email', destination, 'inviter_name', person.full_name));
    end loop;
    return result;
  elsif command = 'request_code' then
    destination := payload->>'email';
    perform pg_advisory_xact_lock(7101048);
    if payload->>'purpose' = 'change' then
      select * into inv from public.connect_invitations where token_hash = payload->>'invitation_hash' and status = 'pending' for update;
      if inv.id is null then raise exception 'This invitation is no longer available'; end if;
    elsif payload->>'purpose' <> 'login' then raise exception 'Invalid verification request'; end if;
    if (select count(*) from public.connect_verifications where requester_hash = payload->>'requester_hash' and created_at > now()-interval '1 hour') >= 5 then
      raise exception 'Too many code requests from this browser. Please try later'; end if;
    if inv.id is not null and (select count(distinct email) from public.connect_verifications where invitation_id = inv.id and created_at > now()-interval '1 day' and email <> destination) >= 2 then
      raise exception 'Too many different replacement addresses. Please contact the chapter'; end if;
    if exists (select 1 from public.connect_verifications where (email = destination or invitation_id = inv.id) and created_at > now() - interval '60 seconds')
      or (select count(*) from public.connect_verifications where (email = destination or invitation_id = inv.id) and created_at > now() - interval '1 hour') >= 5
      then raise exception 'Please wait before requesting another code'; end if;
    if payload->>'purpose' = 'login' and not exists (
      select 1 from public.connect_members m join public.profiles p on p.id = m.profile_id
      where m.email = destination and not m.blocked and p.removed_at is null
    ) then return jsonb_build_object('send', false); end if;
    insert into public.connect_verifications(token_hash, code_hash, invitation_id, email, purpose, requester_hash)
    values (payload->>'token_hash', payload->>'code_hash', inv.id, destination, payload->>'purpose', payload->>'requester_hash');
    return jsonb_build_object('send', true);
  elsif command = 'verify_code' then
    select * into verification from public.connect_verifications where token_hash = payload->>'token_hash' for update;
    if verification.token_hash is null or verification.consumed or verification.verified or verification.expires_at <= now() or verification.attempts >= 5 then
      return jsonb_build_object('ok', false);
    end if;
    update public.connect_verifications set attempts = attempts + 1 where token_hash = verification.token_hash;
    if verification.code_hash <> payload->>'code_hash' then return jsonb_build_object('ok', false); end if;
    update public.connect_verifications set verified = true where token_hash = verification.token_hash;
    if verification.purpose = 'login' then
      select m.profile_id into person_id from public.connect_members m join public.profiles p on p.id = m.profile_id
      where m.email = verification.email and not m.blocked and p.removed_at is null;
      if person_id is null then return jsonb_build_object('ok', false); end if;
      insert into public.connect_sessions(token_hash, profile_id) values (payload->>'session_hash', person_id);
      update public.connect_verifications set consumed = true where token_hash = verification.token_hash;
    end if;
    return jsonb_build_object('ok', true, 'purpose', verification.purpose);
  elsif command = 'accept' then
    perform pg_advisory_xact_lock(7101048);
    select * into inv from public.connect_invitations where token_hash = payload->>'invitation_hash' for update;
    if inv.id is null or inv.status <> 'pending' then raise exception 'This invitation is no longer available'; end if;
    destination := payload->>'email';
    if destination <> inv.email then
      select * into verification from public.connect_verifications where token_hash = payload->>'verification_hash'
        and invitation_id = inv.id and email = destination and purpose = 'change' and verified and not consumed and expires_at > now() for update;
      if verification.token_hash is null then raise exception 'Verify your new email before joining'; end if;
    end if;
    -- Never merge two invitations/profiles based on a name or roll number.
    if exists (select 1 from public.connect_members where email = destination) then
      raise exception 'This address already has an invitation or subscription. Use its original invitation or sign in to Connect';
    end if;
    select invitation_id into other_invitation from public.connect_email_history where email = destination and invitation_id <> inv.id;
    if other_invitation is not null then
      if exists (select 1 from public.connect_email_history where invitation_id = other_invitation and profile_id is not null)
        or exists (select 1 from public.connect_invitations where id = other_invitation and status = 'revoked') then
        raise exception 'Please contact the chapter to reconcile this address';
      end if;
      -- The recipient proved control of both inboxes. Retire the other unused
      -- invitation, preserving both entries in the never-invite-again ledger.
      update public.connect_invitations set status = 'revoked' where id = other_invitation;
      update public.connect_email_history set invitation_id = inv.id where invitation_id = other_invitation;
    end if;
    select id into original_person_id from public.profiles where lower(email) = inv.email;
    select * into person from public.profiles where lower(email) = destination for update;
    if original_person_id is not null and person.id is not null and original_person_id <> person.id then
      raise exception 'These email addresses belong to separate chapter profiles. Please ask the chapter to reconcile them';
    end if;
    if person.id is null and original_person_id is not null then
      select * into person from public.profiles where id = original_person_id for update;
    end if;
    if person.removed_at is not null then raise exception 'Please contact the chapter to restore your access'; end if;
    if person.id is null then
      insert into public.profiles(id, email, contact_email, full_name, first_name, last_name, roll_number, graduation_year, role, membership, has_signed_in, connect_only)
      values (gen_random_uuid(), destination, destination, concat_ws(' ', payload->>'first_name', nullif(payload->>'last_name','')),
        payload->>'first_name', payload->>'last_name', payload->>'roll_number', (payload->>'graduation_year')::integer, 'none', 'alumni', false, true)
      returning * into person;
    else
      -- Existing membership, privileges and confirmed fields remain intact.
      update public.profiles set email = case when not has_signed_in then destination else email end,
        full_name = case when full_name = '' then concat_ws(' ', payload->>'first_name', payload->>'last_name') else full_name end,
        contact_email = case when contact_email = '' or not has_signed_in then destination else contact_email end,
        membership = coalesce(membership, 'alumni'),
        connect_only = connect_only or (role = 'none' and membership is null),
        first_name = case when first_name = '' then payload->>'first_name' else first_name end,
        last_name = case when last_name = '' then payload->>'last_name' else last_name end,
        roll_number = case when roll_number = '' then payload->>'roll_number' else roll_number end,
        graduation_year = coalesce(graduation_year, (payload->>'graduation_year')::integer)
      where id = person.id;
    end if;
    insert into public.connect_members(profile_id, email, unsubscribe_hash) values (person.id, destination, payload->>'unsubscribe_hash');
    insert into public.connect_email_history(email, invitation_id, profile_id) values (destination, inv.id, person.id)
    on conflict (email) do update set profile_id = excluded.profile_id;
    update public.connect_email_history set profile_id = person.id where invitation_id = inv.id;
    update public.connect_invitations set status = 'accepted' where id = inv.id;
    update public.connect_verifications set consumed = true where invitation_id = inv.id;
    insert into public.connect_sessions(token_hash, profile_id) values (payload->>'session_hash', person.id);
    insert into public.mailing_list_contacts(first_name, last_name, email) values (payload->>'first_name', payload->>'last_name', destination)
      on conflict (contact_key) do nothing;
    perform public.connect_refresh_list();
    return jsonb_build_object('profile_id', person.id, 'email', destination);
  elsif command = 'decline' then
    update public.connect_invitations set status = 'declined' where token_hash = payload->>'invitation_hash' and status = 'pending';
    return jsonb_build_object('ok', found);
  elsif command = 'unsubscribe' then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_members set subscribed = false, suppression_pending = true where unsubscribe_hash = payload->>'token_hash' returning profile_id, email into person_id, destination;
    if not found then return jsonb_build_object('ok', false); end if;
    delete from public.connect_sessions where profile_id = person_id;
    perform public.connect_refresh_list();
    return jsonb_build_object('ok', true, 'email', destination);
  elsif command = 'revoke' then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_invitations set status = 'revoked' where id = (payload->>'id')::uuid and status = 'pending';
    return jsonb_build_object('ok', found);
  elsif command = 'block' then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_members set admin_removed = subscribed, subscribed = false, blocked = true, suppression_pending = true where profile_id = (payload->>'id')::uuid and not blocked returning email into destination;
    if not found then return jsonb_build_object('ok', false); end if;
    delete from public.connect_sessions where profile_id = (payload->>'id')::uuid;
    perform public.connect_refresh_list();
    return jsonb_build_object('ok', true, 'email', destination);
  elsif command = 'unblock' then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_members set blocked = false where profile_id = (payload->>'id')::uuid and blocked
      and exists (select 1 from public.profiles where id = (payload->>'id')::uuid and removed_at is null);
    return jsonb_build_object('ok', found);
  elsif command = 'resubscribe' then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_members set subscribed = true, admin_removed = false, suppression_pending = false where profile_id = (payload->>'id')::uuid and not blocked
      and exists (select 1 from public.profiles where id = (payload->>'id')::uuid and removed_at is null);
    if not found then return jsonb_build_object('ok', false); end if;
    perform public.connect_refresh_list();
    return jsonb_build_object('ok', true);
  elsif command = 'provider_optout' then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_members set subscribed = false, admin_removed = false, provider_checked_at = now() where email = payload->>'email';
    if not found then return jsonb_build_object('ok', false); end if;
    perform public.connect_refresh_list();
    return jsonb_build_object('ok', found);
  elsif command = 'release_not_sent' then
    perform pg_advisory_xact_lock(7101048);
    delete from public.connect_email_history where invitation_id = (payload->>'id')::uuid
      and exists (select 1 from public.connect_invitations where id = (payload->>'id')::uuid and delivery = 'not_sent' and status = 'pending');
    if not found then return jsonb_build_object('ok', false); end if;
    delete from public.connect_invitations where id = (payload->>'id')::uuid;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Unknown Connect command';
end;
$$;

-- Respect an existing People removal immediately, including Connect sessions.
create function public.connect_person_removed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null and exists (select 1 from public.connect_members where profile_id = new.id) then
    perform pg_advisory_xact_lock(7101048);
    update public.connect_members set admin_removed = subscribed, subscribed = false, blocked = true, suppression_pending = true where profile_id = new.id;
    delete from public.connect_sessions where profile_id = new.id;
    perform public.connect_refresh_list();
  end if;
  return new;
end;
$$;
create trigger connect_person_removed after update of removed_at on public.profiles for each row execute function public.connect_person_removed();

-- Reuse the existing provisional-person claim when a known alias signs in.
-- An established Google account keeps its ID: another account must use Connect
-- codes rather than silently creating or merging a second person/profile.
create function public.connect_guard_auth_alias() returns trigger
language plpgsql security definer set search_path = '' as $$
declare linked public.profiles;
begin
  select p.* into linked from public.connect_email_history h join public.profiles p on p.id = h.profile_id
    where h.email = lower(btrim(new.email));
  if linked.id is not null and linked.id <> new.id then
    if linked.has_signed_in then
      raise exception 'This email is linked to an existing chapter account. Use your original sign-in account or a Connect email code';
    end if;
    update public.profiles set email = lower(btrim(new.email)) where id = linked.id;
  end if;
  return new;
end;
$$;
create trigger connect_guard_auth_alias before insert on auth.users for each row execute function public.connect_guard_auth_alias();

create function public.admin_set_person_identity(target_id uuid, details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_app_access('users', 'write') then raise exception 'People write access required' using errcode = '42501'; end if;
  update public.profiles set first_name = details->>'first_name', last_name = details->>'last_name',
    roll_number = details->>'roll_number', graduation_year = (details->>'graduation_year')::integer where id = target_id;
  if coalesce((details->>'approve_connect')::boolean,false) then update public.profiles set connect_only = false where id = target_id; end if;
end;
$$;

create function public.connect_duplicate_candidates(profile_ids uuid[])
returns table(profile_id uuid, matches text) language sql stable set search_path = '' as $$
  select p.id, string_agg(other.full_name || ' (' || coalesce(nullif(other.roll_number,''),'same name') || ')', ', ' order by other.id)
  from public.profiles p join public.profiles other on other.id <> p.id and other.removed_at is null
    and ((p.roll_number <> '' and p.roll_number = other.roll_number)
      or (p.full_name <> '' and lower(btrim(p.full_name)) = lower(btrim(other.full_name))))
  where p.id = any(profile_ids) group by p.id;
$$;
revoke all on function public.connect_duplicate_candidates(uuid[]) from public, anon, authenticated;
grant execute on function public.connect_duplicate_candidates(uuid[]) to service_role;

do $$ declare tab text; begin
  foreach tab in array array['connect_invitations','connect_email_history','connect_members','connect_sessions','connect_verifications'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('revoke all on public.%I from public, anon, authenticated', tab);
    execute format('grant all on public.%I to service_role', tab);
  end loop;
end $$;
revoke all on function public.connect_command(text,jsonb), public.connect_refresh_list(), public.connect_person_removed(), public.connect_guard_auth_alias(), public.admin_set_person_identity(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.connect_command(text,jsonb), public.connect_refresh_list() to service_role;
grant execute on function public.admin_set_person_identity(uuid,jsonb) to authenticated;
-- This identity RPC intentionally runs as the signed-in People editor and
-- checks People write permission internally; all credential RPCs stay private.

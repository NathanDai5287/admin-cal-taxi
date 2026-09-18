alter table public.mcp_audit_log
  drop constraint if exists mcp_audit_log_tool_name_check;

alter table public.mcp_audit_log
  add column if not exists request_id uuid,
  add column if not exists target_id text,
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.mcp_audit_log
  add constraint mcp_audit_log_tool_name_check check (char_length(tool_name) between 1 and 100);

create table public.mcp_mutation_requests (
  user_id uuid not null references public.profiles(id) on delete restrict,
  client_id text not null,
  request_id uuid not null,
  tool_name text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id, request_id),
  check (char_length(client_id) between 1 and 200),
  check (char_length(tool_name) between 1 and 100)
);

revoke all on public.mcp_mutation_requests from public, anon, authenticated;

create table public.mcp_external_requests (
  user_id uuid not null references public.profiles(id) on delete restrict,
  client_id text not null,
  request_id uuid not null,
  tool_name text not null,
  status text not null check (status in ('sending', 'failed', 'succeeded')),
  payload jsonb not null,
  result jsonb,
  attempts integer not null default 1,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id, request_id),
  check (char_length(client_id) between 1 and 200),
  check (char_length(tool_name) between 1 and 100)
);

revoke all on public.mcp_external_requests from public, anon, authenticated;

create or replace function public.mcp_admin_read(p_resource text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required' using errcode = '42501';
  end if;

  case p_resource
    when 'members' then
      select jsonb_build_object('members', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', full_name, 'email', email, 'role', role,
        'hasSignedIn', has_signed_in, 'discordUserId', discord_user_id
      ) order by full_name, email), '[]'::jsonb))
      into result from public.profiles where removed_at is null and role in ('member', 'admin');
    when 'reimbursements' then
      select jsonb_build_object('reimbursements', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'memberName', full_name, 'amount', amount, 'description', description,
        'category', category, 'merchant', merchant, 'status', status, 'paid', reimbursed,
        'submittedAt', submitted_at
      ) order by submitted_at desc), '[]'::jsonb))
      into result from public.reimbursements;
    when 'member_charges' then
      select jsonb_build_object('charges', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'memberId', member_id, 'memberName', member_name,
        'amountAssessed', amount_assessed, 'amountPaid', amount_paid,
        'outstanding', amount_assessed - amount_paid, 'dueDate', due_date, 'notes', notes
      ) order by due_date, member_name), '[]'::jsonb))
      into result from public.chapter_receivables;
    when 'finance_activity' then
      select jsonb_build_object(
        'entries', coalesce((select jsonb_agg(jsonb_build_object(
          'id', id, 'kind', kind, 'amount', amount, 'description', description,
          'source', source, 'date', budget_date
        ) order by budget_date desc, created_at desc) from public.reimbursement_budget_entries), '[]'::jsonb),
        'expenses', coalesce((select jsonb_agg(jsonb_build_object(
          'id', id, 'category', category, 'amount', amount, 'description', description,
          'date', expense_date, 'hasReceipt', receipt_path is not null
        ) order by expense_date desc, created_at desc) from public.reimbursement_manual_expenses), '[]'::jsonb)
      ) into result;
    else
      raise exception 'Unknown MCP resource' using errcode = '22023';
  end case;

  insert into public.mcp_audit_log (user_id, client_id, tool_name, details)
  values (auth.uid(), auth.jwt() ->> 'client_id', 'list_' || p_resource, jsonb_build_object('resource', p_resource));
  return result;
end;
$$;

create or replace function public.mcp_admin_write(
  p_action text,
  p_payload jsonb,
  p_request_id uuid default null,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  client text := auth.jwt() ->> 'client_id';
  result jsonb;
  saved_action text;
  row_id uuid;
  member record;
  member_id uuid;
  member_ids uuid[];
  requested_amount numeric;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select saved.result, saved.tool_name into result, saved_action
    from public.mcp_mutation_requests saved
    where saved.user_id = auth.uid() and saved.client_id = client and saved.request_id = p_request_id;
    if found and saved_action <> p_action then
      raise exception 'This request ID belongs to a different action' using errcode = '22023';
    end if;
    if found then return result || jsonb_build_object('replayed', true); end if;
  end if;

  case p_action
    when 'add_charges' then
      if p_request_id is null then raise exception 'A request ID is required' using errcode = '22023'; end if;
      member_ids := array(select distinct (item ->> 'memberId')::uuid from jsonb_array_elements(p_payload -> 'members') item);
      requested_amount := (p_payload ->> 'amount')::numeric;
      if coalesce(array_length(member_ids, 1), 0) < 1 or requested_amount <= 0 then
        raise exception 'Choose members and a positive amount' using errcode = '22023';
      end if;
      if (select count(*) from public.profiles where id = any(member_ids) and removed_at is null and role in ('member', 'admin')) <> array_length(member_ids, 1) then
        raise exception 'One or more members are not active' using errcode = '22023';
      end if;
      with inserted as (
        insert into public.chapter_receivables (member_id, member_name, amount_assessed, due_date, notes, discord_user_id, created_by)
        select id, coalesce(nullif(trim(full_name), ''), email), requested_amount,
          (p_payload ->> 'dueDate')::date,
          coalesce((select item ->> 'notes' from jsonb_array_elements(p_payload -> 'members') item where item ->> 'memberId' = id::text limit 1), ''),
          discord_user_id, auth.uid()
        from public.profiles where id = any(member_ids)
        returning id
      ) select jsonb_build_object('ids', jsonb_agg(id), 'count', count(*)) into result from inserted;
    when 'update_charge' then
      row_id := (p_payload ->> 'chargeId')::uuid;
      requested_amount := (p_payload ->> 'amount')::numeric;
      member_id := (p_payload ->> 'memberId')::uuid;
      select * into member from public.profiles
      where id = member_id and removed_at is null and role in ('member', 'admin');
      if not found or requested_amount <= 0 then raise exception 'The charge update is not valid' using errcode = '22023'; end if;
      update public.chapter_receivables
      set member_id = member.id, member_name = coalesce(nullif(trim(member.full_name), ''), member.email),
        amount_assessed = case when amount_paid >= amount_assessed then requested_amount else amount_paid + requested_amount end,
        amount_paid = case when amount_paid >= amount_assessed then requested_amount else amount_paid end,
        due_date = (p_payload ->> 'dueDate')::date, notes = coalesce(p_payload ->> 'notes', ''),
        discord_user_id = member.discord_user_id
      where id = row_id returning jsonb_build_object('id', id) into result;
    when 'record_credit' then
      if p_request_id is null then raise exception 'A request ID is required' using errcode = '22023'; end if;
      row_id := (p_payload ->> 'chargeId')::uuid;
      requested_amount := (p_payload ->> 'amount')::numeric;
      update public.chapter_receivables set amount_paid = amount_paid + requested_amount
      where id = row_id and requested_amount > 0 and amount_paid + requested_amount <= amount_assessed
      returning jsonb_build_object('id', id, 'amountPaid', amount_paid, 'outstanding', amount_assessed - amount_paid) into result;
    when 'set_charge_paid' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      row_id := (p_payload ->> 'chargeId')::uuid;
      update public.chapter_receivables
      set amount_paid = case when (p_payload ->> 'paid')::boolean then amount_assessed else 0 end
      where id = row_id returning jsonb_build_object('id', id, 'amountPaid', amount_paid) into result;
    when 'delete_charges' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      member_ids := array(select jsonb_array_elements_text(p_payload -> 'chargeIds')::uuid);
      with deleted as (delete from public.chapter_receivables where id = any(member_ids) returning id)
      select jsonb_build_object('ids', coalesce(jsonb_agg(id), '[]'::jsonb), 'count', count(*)) into result from deleted;
    when 'add_ledger_entry' then
      if p_request_id is null then raise exception 'A request ID is required' using errcode = '22023'; end if;
      insert into public.reimbursement_budget_entries (kind, amount, description, source, budget_date, created_by)
      values ((p_payload ->> 'kind'), (p_payload ->> 'amount')::numeric, p_payload ->> 'description',
        (p_payload ->> 'source')::public.chapter_income_source, (p_payload ->> 'date')::date, auth.uid())
      returning jsonb_build_object('id', id) into result;
    when 'delete_ledger_entry' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      delete from public.reimbursement_budget_entries where id = (p_payload ->> 'entryId')::uuid
      returning jsonb_build_object('id', id) into result;
    when 'add_expense' then
      if p_request_id is null then raise exception 'A request ID is required' using errcode = '22023'; end if;
      insert into public.reimbursement_manual_expenses (category, amount, description, expense_date, created_by)
      values ((p_payload ->> 'category')::public.reimbursement_category, (p_payload ->> 'amount')::numeric,
        p_payload ->> 'description', (p_payload ->> 'date')::date, auth.uid())
      returning jsonb_build_object('id', id) into result;
    when 'delete_expense' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      delete from public.reimbursement_manual_expenses where id = (p_payload ->> 'expenseId')::uuid
      returning jsonb_build_object('id', id, 'receiptPath', receipt_path) into result;
    when 'set_opening_cash' then
      update public.chapter_financial_settings set opening_cash = (p_payload ->> 'amount')::numeric, updated_by = auth.uid()
      where id returning jsonb_build_object('openingCash', opening_cash) into result;
    when 'set_budget' then
      update public.reimbursement_budgets set
        category_amounts = jsonb_set(
          category_amounts,
          array[p_payload ->> 'category'],
          coalesce(p_payload -> 'amount', 'null'::jsonb),
          true
        ),
        updated_by = auth.uid()
      where id
      returning jsonb_build_object(
        'category', p_payload ->> 'category',
        'amount', category_amounts -> (p_payload ->> 'category')
      ) into result;
    when 'update_reimbursement' then
      if ((p_payload ->> 'status') = 'denied' or (p_payload ? 'paid' and not (p_payload ->> 'paid')::boolean)) and not coalesce(p_confirmed, false) then
        raise exception 'Confirmation is required' using errcode = '22023';
      end if;
      update public.reimbursements set
        status = coalesce((p_payload ->> 'status')::public.reimbursement_status, status),
        merchant = coalesce(p_payload ->> 'merchant', merchant),
        category = coalesce((p_payload ->> 'category')::public.reimbursement_category, category),
        reimbursed = coalesce((p_payload ->> 'paid')::boolean, reimbursed)
      where id = (p_payload ->> 'reimbursementId')::uuid
        and (not (p_payload ? 'status') or (not reimbursed and status <> 'pending'))
        and (not coalesce((p_payload ->> 'paid')::boolean, false)
          or coalesce(p_payload ->> 'status', status::text) = 'approved')
      returning jsonb_build_object('id', id, 'status', status, 'paid', reimbursed) into result;
    when 'invite_user' then
      if p_request_id is null then raise exception 'A request ID is required' using errcode = '22023'; end if;
      if (p_payload ->> 'role') = 'admin' and not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      if (p_payload ->> 'role') not in ('member', 'admin') or trim(coalesce(p_payload ->> 'email', '')) = '' then
        raise exception 'A valid email and role are required' using errcode = '22023';
      end if;
      update public.profiles set role = (p_payload ->> 'role')::public.app_role, removed_at = null
      where lower(email) = lower(trim(p_payload ->> 'email'));
      if not found then
        insert into public.profiles (id, full_name, email, role, has_signed_in)
        values (gen_random_uuid(), '', lower(trim(p_payload ->> 'email')), (p_payload ->> 'role')::public.app_role, false);
      end if;
      insert into public.invites (email, role, invited_by)
      values (lower(trim(p_payload ->> 'email')), (p_payload ->> 'role')::public.app_role, auth.uid())
      on conflict (email) do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
      result := jsonb_build_object('email', lower(trim(p_payload ->> 'email')), 'role', p_payload ->> 'role');
    when 'set_user_role' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      if (p_payload ->> 'role') not in ('member', 'admin') then raise exception 'The role is not valid' using errcode = '22023'; end if;
      if (p_payload ->> 'userId')::uuid = auth.uid() and (p_payload ->> 'role') <> 'admin' then
        raise exception 'You cannot remove your own administrator access' using errcode = '22023';
      end if;
      update public.profiles set role = (p_payload ->> 'role')::public.app_role
      where id = (p_payload ->> 'userId')::uuid and removed_at is null;
      if not found then raise exception 'The member was not found' using errcode = 'P0002'; end if;
      update public.invites set role = (p_payload ->> 'role')::public.app_role
      where email = (select lower(email) from public.profiles where id = (p_payload ->> 'userId')::uuid and not has_signed_in);
      result := jsonb_build_object('id', p_payload ->> 'userId', 'role', p_payload ->> 'role');
    when 'set_pending_user_name' then
      update public.profiles set full_name = trim(p_payload ->> 'name')
      where id = (p_payload ->> 'userId')::uuid and not has_signed_in and removed_at is null
        and char_length(trim(p_payload ->> 'name')) between 1 and 120;
      if not found then raise exception 'The pending member was not found' using errcode = 'P0002'; end if;
      result := jsonb_build_object('id', p_payload ->> 'userId', 'name', p_payload ->> 'name');
    when 'set_discord_user_id' then
      if coalesce(p_payload ->> 'discordUserId', '') <> '' and (p_payload ->> 'discordUserId') !~ '^[0-9]{15,22}$' then
        raise exception 'The Discord ID is not valid' using errcode = '22023';
      end if;
      update public.profiles set discord_user_id = coalesce(p_payload ->> 'discordUserId', '')
      where id = (p_payload ->> 'userId')::uuid and removed_at is null;
      if not found then raise exception 'The member was not found' using errcode = 'P0002'; end if;
      update public.chapter_receivables set discord_user_id = coalesce(p_payload ->> 'discordUserId', '')
      where member_id = (p_payload ->> 'userId')::uuid;
      result := jsonb_build_object('id', p_payload ->> 'userId', 'discordUserId', coalesce(p_payload ->> 'discordUserId', ''));
    when 'remove_user' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      if (p_payload ->> 'userId')::uuid = auth.uid() then raise exception 'You cannot remove yourself' using errcode = '22023'; end if;
      update public.profiles set removed_at = now() where id = (p_payload ->> 'userId')::uuid
      returning email, has_signed_in into member;
      if not found then raise exception 'The member was not found' using errcode = 'P0002'; end if;
      if not member.has_signed_in then delete from public.invites where email = lower(member.email); end if;
      result := jsonb_build_object('id', p_payload ->> 'userId', 'removed', true);
    when 'bulk_set_charges_paid' then
      if not coalesce(p_confirmed, false) then raise exception 'Confirmation is required' using errcode = '22023'; end if;
      member_ids := array(select jsonb_array_elements_text(p_payload -> 'chargeIds')::uuid);
      with updated as (
        update public.chapter_receivables set amount_paid = amount_assessed
        where id = any(member_ids) returning id
      ) select jsonb_build_object('ids', coalesce(jsonb_agg(id), '[]'::jsonb), 'count', count(*)) into result from updated;
    else
      raise exception 'Unknown MCP action' using errcode = '22023';
  end case;

  if result is null then raise exception 'The requested record was not found or could not be changed' using errcode = 'P0002'; end if;

  insert into public.mcp_audit_log (user_id, client_id, tool_name, request_id, target_id, details)
  values (auth.uid(), client, p_action, p_request_id,
    coalesce(p_payload ->> 'chargeId', p_payload ->> 'entryId', p_payload ->> 'expenseId', p_payload ->> 'reimbursementId', p_payload ->> 'userId'),
    p_payload - array['notes', 'description']::text[]);

  if p_request_id is not null then
    insert into public.mcp_mutation_requests (user_id, client_id, request_id, tool_name, result)
    values (auth.uid(), client, p_request_id, p_action, result);
  end if;
  return result;
end;
$$;

revoke all on function public.mcp_admin_read(text) from public, anon, authenticated;
revoke all on function public.mcp_admin_write(text, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.mcp_admin_read(text) to authenticated;
grant execute on function public.mcp_admin_write(text, jsonb, uuid, boolean) to authenticated;

create or replace function public.mcp_begin_external(
  p_action text,
  p_payload jsonb,
  p_request_id uuid,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  client text := auth.jwt() ->> 'client_id';
  request_row public.mcp_external_requests%rowtype;
  inserted boolean := false;
  prepared jsonb;
  charge_ids uuid[];
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required' using errcode = '42501';
  end if;
  if p_request_id is null or not coalesce(p_confirmed, false) then
    raise exception 'A request ID and confirmation are required' using errcode = '22023';
  end if;
  if p_action not in ('send_dues_announcement', 'send_invite_email') then
    raise exception 'Unknown external MCP action' using errcode = '22023';
  end if;

  if p_action = 'send_dues_announcement' then
    charge_ids := array(select jsonb_array_elements_text(p_payload -> 'chargeIds')::uuid);
    select jsonb_build_object('recipients', coalesce(jsonb_agg(jsonb_build_object(
      'userId', discord_user_id, 'amountOwed', amount_assessed - amount_paid
    ) order by member_name), '[]'::jsonb)) into prepared
    from public.chapter_receivables
    where id = any(charge_ids) and amount_assessed > amount_paid and discord_user_id ~ '^[0-9]{15,22}$';
  else
    prepared := jsonb_build_object('email', lower(trim(p_payload ->> 'email')), 'role', p_payload ->> 'role');
  end if;

  insert into public.mcp_external_requests (
    user_id, client_id, request_id, tool_name, status, payload, lease_until
  ) values (
    auth.uid(), client, p_request_id, p_action, 'sending', prepared, now() + interval '2 minutes'
  ) on conflict do nothing returning true into inserted;

  select * into request_row from public.mcp_external_requests
  where user_id = auth.uid() and client_id = client and request_id = p_request_id
  for update;

  if request_row.tool_name <> p_action then
    raise exception 'This request ID belongs to a different action' using errcode = '22023';
  end if;
  if inserted then
    return prepared || jsonb_build_object('shouldSend', true);
  end if;
  if request_row.status = 'succeeded' then
    return coalesce(request_row.result, '{}'::jsonb) || jsonb_build_object('shouldSend', false, 'status', 'succeeded');
  end if;
  if request_row.status = 'sending' and request_row.lease_until > now() then
    return jsonb_build_object('shouldSend', false, 'status', 'in_progress');
  end if;

  update public.mcp_external_requests set
    status = 'sending', attempts = attempts + 1, lease_until = now() + interval '2 minutes', updated_at = now()
  where user_id = auth.uid() and client_id = client and request_id = p_request_id;
  return request_row.payload || jsonb_build_object('shouldSend', true);
end;
$$;

create or replace function public.mcp_finish_external(
  p_request_id uuid,
  p_succeeded boolean,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  client text := auth.jwt() ->> 'client_id';
  request_row public.mcp_external_requests%rowtype;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required' using errcode = '42501';
  end if;

  update public.mcp_external_requests set
    status = case when p_succeeded then 'succeeded' else 'failed' end,
    result = p_result, lease_until = null, updated_at = now()
  where user_id = auth.uid() and client_id = client and request_id = p_request_id and status = 'sending'
  returning * into request_row;
  if not found then raise exception 'The external request is not active' using errcode = 'P0002'; end if;

  if p_succeeded then
    insert into public.mcp_audit_log (user_id, client_id, tool_name, request_id, details)
    values (auth.uid(), client, request_row.tool_name, p_request_id, jsonb_build_object('attempts', request_row.attempts));
  end if;
  return jsonb_build_object('status', request_row.status, 'attempts', request_row.attempts);
end;
$$;

revoke all on function public.mcp_begin_external(text, jsonb, uuid, boolean) from public, anon, authenticated;
revoke all on function public.mcp_finish_external(uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_begin_external(text, jsonb, uuid, boolean) to authenticated;
grant execute on function public.mcp_finish_external(uuid, boolean, jsonb) to authenticated;

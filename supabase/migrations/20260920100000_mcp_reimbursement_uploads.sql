create or replace function public.mcp_create_reimbursement(
  p_member_id uuid,
  p_category public.reimbursement_category,
  p_amount numeric,
  p_description text,
  p_payment_method text,
  p_receipt_path text,
  p_paid boolean,
  p_request_id uuid
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
  member public.profiles%rowtype;
begin
  if not public.is_mcp_admin() then
    raise exception 'An active administrator OAuth grant is required' using errcode = '42501';
  end if;

  select saved.result, saved.tool_name into result, saved_action
  from public.mcp_mutation_requests saved
  where saved.user_id = auth.uid() and saved.client_id = client and saved.request_id = p_request_id;
  if found and saved_action <> 'create_reimbursement' then
    raise exception 'This request ID belongs to a different action' using errcode = '22023';
  end if;
  if found then return result || jsonb_build_object('replayed', true); end if;

  select * into member from public.profiles
  where id = p_member_id and removed_at is null and role in ('member', 'admin');
  if not found then raise exception 'The member was not found' using errcode = 'P0002'; end if;
  if p_amount <= 0 or p_amount > 999999999.99 then
    raise exception 'Enter a valid positive amount' using errcode = '22023';
  end if;
  if char_length(trim(p_description)) not between 1 and 2000
    or char_length(trim(p_payment_method)) not between 1 and 200 then
    raise exception 'The reimbursement details are not valid' using errcode = '22023';
  end if;
  if p_receipt_path !~ '^mcp/[0-9a-f-]{36}\.(jpg|png)$' then
    raise exception 'The receipt path is not valid' using errcode = '22023';
  end if;

  insert into public.reimbursements (
    user_id, full_name, category, amount, description, payment_method,
    receipt_path, status, reimbursed
  ) values (
    member.id, coalesce(nullif(trim(member.full_name), ''), member.email), p_category,
    p_amount, trim(p_description), trim(p_payment_method), p_receipt_path, 'approved', p_paid
  ) returning jsonb_build_object(
    'id', id, 'memberId', user_id, 'memberName', full_name, 'amount', amount,
    'status', status, 'paid', reimbursed, 'receiptPath', receipt_path
  ) into result;

  insert into public.mcp_audit_log (user_id, client_id, tool_name, request_id, target_id, details)
  values (
    auth.uid(), client, 'create_reimbursement', p_request_id, result ->> 'id',
    jsonb_build_object('memberId', p_member_id, 'category', p_category, 'amount', p_amount, 'paid', p_paid)
  );
  insert into public.mcp_mutation_requests (user_id, client_id, request_id, tool_name, result)
  values (auth.uid(), client, p_request_id, 'create_reimbursement', result);

  return result;
end;
$$;

revoke all on function public.mcp_create_reimbursement(
  uuid, public.reimbursement_category, numeric, text, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.mcp_create_reimbursement(
  uuid, public.reimbursement_category, numeric, text, text, text, boolean, uuid
) to authenticated;

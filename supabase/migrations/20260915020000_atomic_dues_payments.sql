create table if not exists public.dues_payment_requests (
  request_id uuid primary key,
  receivable_id uuid not null references public.chapter_receivables(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on public.dues_payment_requests from public, anon, authenticated;

create or replace function public.record_dues_payment(
  p_receivable_id uuid,
  p_payment_amount numeric,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_payment_amount <= 0 then
    return false;
  end if;

  insert into public.dues_payment_requests (request_id, receivable_id)
  values (p_request_id, p_receivable_id)
  on conflict (request_id) do nothing;
  if not found then
    return true;
  end if;

  update public.chapter_receivables
  set amount_paid = amount_paid + p_payment_amount
  where id = p_receivable_id
    and amount_paid + p_payment_amount <= amount_assessed;
  if not found then
    delete from public.dues_payment_requests where request_id = p_request_id;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.record_dues_payment(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_dues_payment(uuid, numeric, uuid) to authenticated;

create or replace function public.set_dues_paid_state(p_receivable_id uuid, p_paid boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.chapter_receivables
  set amount_paid = case when p_paid then amount_assessed else 0 end
  where id = p_receivable_id;
  return found;
end;
$$;

revoke all on function public.set_dues_paid_state(uuid, boolean) from public, anon;
grant execute on function public.set_dues_paid_state(uuid, boolean) to authenticated;

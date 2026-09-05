-- Soft-delete profiles instead of deleting them: removed members keep their
-- row (and their reimbursement history) but lose all access and disappear
-- from the members list.

alter table public.profiles
  add column removed_at timestamptz;

-- Removed profiles count as no access everywhere.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and removed_at is null
  );
$$;

-- Removing now archives the profile instead of deleting the row.
create or replace function public.admin_remove_profile(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can remove users';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;
  update public.profiles set removed_at = now() where id = target_user_id;
end;
$$;

-- Re-inviting someone who was removed restores their access.
create or replace function public.admin_invite_email(invite_email text, invite_role public.app_role)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can invite users';
  end if;
  if invite_role not in ('member', 'admin') then
    raise exception 'invites must be for member or admin';
  end if;
  if exists (select 1 from public.profiles where email = lower(invite_email)) then
    update public.profiles
    set role = invite_role, removed_at = null
    where email = lower(invite_email);
    delete from public.invites where email = lower(invite_email);
  else
    insert into public.invites (email, role, invited_by)
    values (lower(invite_email), invite_role, auth.uid())
    on conflict (email) do update
    set role = excluded.role, invited_by = excluded.invited_by;
  end if;
end;
$$;

-- Removed users must not be able to submit reimbursements.
drop policy "members can submit reimbursements for themselves"
  on public.reimbursements;
create policy "members can submit reimbursements for themselves"
  on public.reimbursements for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and merchant is null
    and receipt_date is null
    and receipt_total is null
    and failure_reason is null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('member', 'admin') and removed_at is null
    )
  );

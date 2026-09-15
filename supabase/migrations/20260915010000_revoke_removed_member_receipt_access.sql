-- The original reimbursement SELECT policies only checked row ownership.
-- Require an active member/admin profile as well so removing a member revokes
-- direct REST access to their reimbursement details and legacy receipt paths.

drop policy if exists "members can view their reimbursements and admins can view all"
  on public.reimbursements;

create policy "active members can view their reimbursements and admins can view all"
  on public.reimbursements for select to authenticated
  using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('member', 'admin')
          and removed_at is null
      )
    )
  );

drop policy if exists "members can read their receipts and admins can read all"
  on storage.objects;

create policy "active members can read their receipts and admins can read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and exists (
          select 1 from public.profiles
          where id = auth.uid()
            and role in ('member', 'admin')
            and removed_at is null
        )
      )
    )
  );

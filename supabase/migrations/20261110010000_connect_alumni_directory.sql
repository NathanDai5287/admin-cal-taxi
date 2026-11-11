-- Read-only page details for the People admin directory. Counts run in SQL so
-- they include the full referral history, not just a PostgREST response page.
create index if not exists connect_email_history_profile
  on public.connect_email_history(profile_id, invitation_id);

create function public.connect_alumni_directory_details(profile_ids uuid[])
returns table (
  profile_id uuid, first_name text, last_name text, roll_number text,
  graduation_year integer, invited_count bigint, invited_by text
)
language sql stable set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.roll_number, p.graduation_year,
    (select count(*) from public.connect_invitations sent
      where sent.inviter_id = p.id and (sent.delivery = 'sent' or sent.status = 'accepted')),
    coalesce(source.inviter_name, 'Chapter')
  from public.connect_members m
  join public.profiles p on p.id = m.profile_id
  left join lateral (
    select coalesce(nullif(inviter.full_name, ''), nullif(i.inviter_name, ''), 'Chapter') as inviter_name
    from public.connect_email_history h
    join public.connect_invitations i on i.id = h.invitation_id and i.status = 'accepted'
    left join public.profiles inviter on inviter.id = i.inviter_id
    where h.profile_id = p.id
    order by i.created_at, i.id
    limit 1
  ) source on true
  where p.id = any(profile_ids);
$$;
revoke all on function public.connect_alumni_directory_details(uuid[]) from public, anon, authenticated;
grant execute on function public.connect_alumni_directory_details(uuid[]) to service_role;

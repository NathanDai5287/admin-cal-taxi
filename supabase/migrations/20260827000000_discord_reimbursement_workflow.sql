alter table public.reimbursements
  add column discord_message_id text,
  add column discord_channel_id text,
  add column discord_notified_at timestamptz,
  add column discord_decided_at timestamptz,
  add column discord_reviewer_id text;

create unique index reimbursements_discord_message_id_idx
  on public.reimbursements (discord_message_id)
  where discord_message_id is not null;

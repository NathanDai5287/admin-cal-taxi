-- Exact Discord user IDs are required for reliable, targeted mentions.
alter table public.chapter_receivables
  add column discord_user_id text not null default ''
  check (discord_user_id = '' or discord_user_id ~ '^[0-9]{15,22}$');

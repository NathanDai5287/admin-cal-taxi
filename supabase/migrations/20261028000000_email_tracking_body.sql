alter table public.email_tracking_messages
  add column body jsonb,
  add column failed_at timestamptz,
  add column error text check (error is null or char_length(error) <= 500);

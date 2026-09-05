-- Reimbursement submissions are now public (no Supabase auth). Rows are
-- inserted by the server with the secret key, so user_id may be null.
alter table public.reimbursements
  alter column user_id drop not null;

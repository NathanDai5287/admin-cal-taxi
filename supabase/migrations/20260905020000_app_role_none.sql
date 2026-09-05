-- Add the 'none' app_role value in its own transaction. Postgres cannot use a
-- newly added enum value in the same transaction that introduces it.

alter type public.app_role add value if not exists 'none';

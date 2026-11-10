-- Keep a name snapshot so payment history survives profile renames/removal.
-- Historical events have no reliable recorder and intentionally remain null.
alter table public.chapter_dues_payment_events
  add column recorded_by uuid references public.profiles(id) on delete set null,
  add column recorder_name text;

create or replace function public.record_dues_payment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_date date;
  recorder_id uuid := auth.uid();
  recorder_label text;
begin
  if new.amount_paid = old.amount_paid then return new; end if;
  event_date := coalesce(nullif(current_setting('app.dues_payment_date', true), '')::date, current_date);
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''))
    into recorder_label from public.profiles where id = recorder_id;
  insert into public.chapter_dues_payment_events (
    receivable_id, amount, paid_date, date_is_estimated, recorded_by, recorder_name
  ) values (
    new.id,
    new.amount_paid - old.amount_paid,
    event_date,
    false,
    recorder_id,
    recorder_label
  );
  return new;
end;
$$;

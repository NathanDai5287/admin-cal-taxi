alter table public.venue_inquiries
  add column phone text check (phone is null or char_length(phone) between 7 and 30);

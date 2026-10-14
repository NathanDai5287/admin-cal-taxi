-- The title photo gets a focus point, like headshots and gallery photos: cover = {"src", "focus"}.
-- Row triggers are off during the copy, so a finalized issue keeps its cover and its updated_at.
alter table public.nu_news_issues add column cover jsonb;

alter table public.nu_news_issues disable trigger user;
update public.nu_news_issues
  set cover = jsonb_build_object('src', cover_src, 'focus', jsonb_build_array(0.5, 0.5))
  where cover_src is not null;
alter table public.nu_news_issues enable trigger user;

alter table public.nu_news_issues drop column cover_src;

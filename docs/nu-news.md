# Nu News

Nu News is the chapter newsletter. Each semester an admin enters the issue at `/nu-news`
and the site makes the PDF. The PDF prints each author's writing exactly as entered.

## Make an issue

1. Open **Nu News** on the admin home page and select **New issue**. The new draft copies
   the location and the donation text from the most recent issue. Articles and photos
   start empty.
2. **Issue details:** enter the season (for example, Fall 2026), the issue date, and the
   location.
3. **Cover:** upload the title photo, then enter the intro heading and the intro text.
4. **Articles:** select **Add article** for each author. Enter the title, the author, the
   roster number, the headshot, the text, and the sign-off lines. Paste the text exactly
   as the author sent it. Each line becomes a paragraph; empty lines are ignored. Use
   **Move up**, **Move down**, and **Remove** to change the list.
5. **Photos:** choose any number of photos at once. Use the arrows to change their order
   and **Remove** to take one out. Photos fill the empty space at the bottom of article
   pages in this order, one to three per row, then the Photo Gallery pages. **Full width**
   keeps a photo for the gallery, where it gets its own row. **Donate photo** puts one
   photo above How to Donate.
   Click any photo (title photo, headshot, or gallery photo) to choose the spot that stays
   in view when the photo is cropped. A dot marks the spot; the arrow keys move it and
   **Reset focus** puts it back in the middle (a little above the middle for headshots).
6. **How to donate:** check the text. Each line is one item.
7. Select **Save**, then **Make preview**. The preview opens below the buttons and has a
   DRAFT mark. Make a new preview after each change; it replaces the previous preview.
   **Photo warnings** then lists any title photo, headshot, or donate page photo that
   loses more than 30% of its width or height, for example "Sam Patel’s headshot loses
   44% of its height". Click a warning to go to the photo, then move its focus point or
   use a better-shaped photo. Warnings do not stop you from finalizing.
8. **Before you finalize** lists what is still missing, for example "No title photo" or
   "Alex Rivera has no headshot". **Finalize** stays off until the list is empty.
9. Select **Finalize** and confirm. The site makes the PDF without the DRAFT mark and
   stores it permanently. The issue then shows who finalized it and when, and a
   **Download PDF** button.

A final issue can never change: there are no new versions, corrections, or copies. Check
the preview carefully before you finalize.

## Using an agent

An administrator can also ask an AI agent to do every step above. Connect the agent to
the site's MCP server first (see "Connect an AI client" in the README). The agent can
create an issue, enter the text, add and order articles and photos, set focus points,
make the preview, read the photo warnings, and finalize.

- The agent must copy each author's text exactly. The PDF prints it as entered.
- The agent sends one photo at a time, and the site does not change it. The site accepts
  only a JPEG of at most 3 MB and 2200 pixels on the long side, upright, with no metadata
  (no EXIF, XMP, IPTC, or comments). It refuses other photos and tells the agent what to
  fix. Agent photos go through a Vercel function, so they must stay under its 4.5 MB
  request limit.
- To finalize, the agent must send the issue's season as confirmation. Finalizing stays
  off while something is missing. Tell the agent to finalize only after you read the
  preview.
- The links that the agent gets to a preview, a final PDF, or a photo expire after 10 minutes.
- Each call writes a record in the MCP audit log.

## Photos

The browser converts HEIC photos to JPEG, turns them upright, removes their metadata,
and makes them at most 2200 pixels on the long side before upload. Photos go straight to
the private `nu-news` Storage bucket through a signed upload link, so they never pass
through a Vercel function (Vercel rejects request bodies over 4.5 MB). The PDF is
larger than a Vercel response may be, so the server stores it in the bucket and the
browser downloads it through a short-lived signed link.

## What stays permanent

Finalizing records `finalized_at`, `finalized_by`, the finalizer's name, the SHA-256 of
the PDF, and the exact inputs (the text and photo data given to the template, and the
SHA-256 of every photo). Database triggers enforce the rest for every role, including
the service role:

- A finalized row cannot be updated or deleted (`nu_news_issues_guard`, error 22023).
- The final PDF and every photo of a finalized issue cannot be overwritten, moved, or
  deleted in Storage (`nu_news_final_files_guard` on `storage.objects`, error 22023).
- Each final PDF has its own new path and is uploaded without overwrite.

## Setup

Apply `supabase/migrations/20261014000000_nu_news.sql`, then
`supabase/migrations/20261014120000_nu_news_cover_focus.sql`, once each, in the Supabase
SQL editor or with `npx supabase db push`. The first adds the `nu_news_issues` table, the
private `nu-news` bucket, admin-only policies, and the two guard triggers. The second
gives the title photo a focus point (`cover_src` becomes `cover`). Until the first runs,
`/nu-news` shows a setup message and the rest of the site is unaffected.

The template, fonts, and assets are in `lib/nu-news/`. Run `npm run test:nu-news` after
any change to them. The test needs `pdftotext` (Poppler) and, for the comparison with
the command-line build, the `typst` CLI.

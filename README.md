# admin-cal-taxi

Internal Next.js tools for cal.taxi, including rush administration, hosting documents,
and chapter finances.

## Sites

- `admin.cal.taxi` — the internal tools. `/host`, `/rush`, `/finance`, and `/users` all require sign-in with a profile whose role
  is `admin`.
- `reimbursements.cal.taxi` — the member reimbursement submission page.
  Requires sign-in with a profile whose role is `member` or `admin`. Served by
  the same deployment: `proxy.ts` detects the host and rewrites `/` to the
  internal `/submit` route.

To run the member site locally, visit `http://reimbursements.localhost:3000`.

### Accounts and roles

Both sites share one Supabase Auth user base and the `profiles` table. Sign-in
is Google-only (Supabase Auth's Google provider): signed-out visitors get
Google's One Tap account chooser automatically, with a button in the
top-right corner as fallback; the same corner shows the account menu (with
sign-out) once signed in. Sessions use a shared `.cal.taxi` cookie in
production, so one sign-in covers both sites.

Every profile has one of three roles:

- `none` — the default for new sign-ins. No access to anything.
- `member` — may submit reimbursements at `reimbursements.cal.taxi`.
- `admin` — full access to every tool, including user management.

Admins manage access at `admin.cal.taxi/users`: invite an email address with a
role (applied automatically on that person's first Google sign-in via the
`handle_new_user` trigger and the `invites` table), or change an existing
user's role directly.

One-time setup: enable the Google provider in Supabase Authentication with an
OAuth client from Google Cloud Console (redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`), then disable the email
provider. In the same Google OAuth client, add these **Authorized JavaScript
origins** so the One Tap prompt may appear: `https://admin.cal.taxi`,
`https://reimbursements.cal.taxi`, and for local development
`http://localhost:3000` and `http://reimbursements.localhost:3000`. Set
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` to that client's ID in the website environment.
To bootstrap the first admin, promote an existing user with:

```sql
update public.profiles set role = 'admin' where id = '<user-id>';
```

## Receipt reimbursements

A signed-in member submits an expense. The browser uploads the receipt image
straight to private Supabase Storage through a short-lived signed upload URL,
then a server action records the row with the Supabase secret key. Tabscanner
performs receipt total extraction in the background. Submissions move from
`pending` to `verified`, `mismatch`, or `processing_failed`; a reviewer at
`admin.cal.taxi/finance/review` can then mark them `approved` or `denied`.
Admins record payouts separately at `/finance/accounts/payable`.

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Apply the SQL files in `supabase/migrations` to the Supabase project in filename order.

Use Node.js 22 or newer. Run locally with `npm install` and `npm run dev`. Verify
changes with `npm run lint` and `npm run build`.

### Discord review bot

Completed receipt processing can post a short reimbursement summary and the private
receipt image to a Discord channel. Reviewers can react with ✅ to set the website
status to `approved`, or ❌ to set it to `denied`.

1. Apply `supabase/migrations/20260827000000_discord_reimbursement_workflow.sql`.
2. Create a Discord application and bot, then invite it to the server with these
   channel permissions: View Channel, Send Messages, Embed Links, Attach Files,
   Read Message History, Add Reactions, and Manage Messages. The bot uses the
   standard Guilds and Guild Message Reactions gateway intents; Message Content is
   not needed.
3. Set `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, and
   `REIMBURSEMENTS_WEBHOOK_SECRET` in the website environment. The worker also needs
   the bot token, channel ID, Supabase URL, and Supabase secret key. Optionally set
   `DISCORD_REVIEWER_ROLE_ID` on the worker. When it is omitted, only members with
   Discord's Manage Messages permission may decide a submission.
4. In Supabase, create a Database Webhook for the `public.reimbursements` table.
   Select both Insert and Update events, use
   `https://admin.cal.taxi/api/webhooks/reimbursements` as the POST URL, and add an
   `x-webhook-secret` header equal to `REIMBURSEMENTS_WEBHOOK_SECRET`. Update events
   are required because the Discord notification waits for receipt scanning to
   finish, preventing the scanner from overwriting a fast Discord decision.
5. Run the persistent gateway worker on an always-on Node.js host:

   ```sh
   npm run discord-bot
   ```

The web app may remain on serverless hosting, but the Discord worker must remain
running so it can receive reaction events. Supabase's secret key and the Discord bot
token must never be exposed to browser code.

### Discord dues announcements

Admins can compose a custom message from Finance → Accounts → Receivable and send it to selected
members with outstanding balances. The web app posts through the same bot token as
the reimbursement workflow; the persistent reaction worker is not required for
announcements.

1. Apply `supabase/migrations/20260911010000_dues_discord_announcements.sql`.
2. Set `DISCORD_ANNOUNCEMENT_CHANNEL_ID` in the website environment and give the bot
   View Channel and Send Messages permissions in that channel.
3. Add each member's Discord user ID to their dues balance. The announcement action
   allows only those exact user mentions and blocks automatic role or everyone mentions.

## Finance organization

Dues and reimbursements share `/finance`: Accounts (receivable, payable and
activity), Planning, Review, and read-only Reports. Manual direct expenses are
admin-only and support optional JPG/PNG receipt images. All activity is treated
as the current term; no term selection is exposed.

See [Finance organization](docs/finance-organization.md) for page ownership,
required migration, verification, retained accounting behavior, and the future
whole-site snapshot/restore plan.

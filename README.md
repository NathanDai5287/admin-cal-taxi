# admin-cal-taxi

Internal Next.js tools for cal.taxi, including rush administration, hosting documents,
and receipt reimbursements.

## Receipt reimbursements

The reimbursement app is mounted at `/reimbursements` and uses Supabase for invited-user
authentication, PostgreSQL data, and private receipt storage. Tabscanner performs receipt
total extraction in the background.

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Apply `supabase/migrations/20260826000000_receipt_reimbursements.sql` to the Supabase project.
3. In Supabase Auth, disable public signups and allow these redirect URLs:
   - `http://localhost:3000/reimbursements/auth/callback`
   - `https://admin.cal.taxi/reimbursements/auth/callback`
4. Create the first user in Supabase Auth, then promote that account in SQL:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'treasurer@example.org');
   ```

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

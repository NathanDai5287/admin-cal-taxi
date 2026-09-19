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
provider. In Supabase Authentication → URL Configuration, add both
`https://admin.cal.taxi/auth/callback` and
`https://reimbursements.cal.taxi/auth/callback` to **Redirect URLs**. Without
the member callback, Google can authenticate successfully but return the user
somewhere that never exchanges the login code, leaving the app signed out.

In the same Google OAuth client, add these **Authorized JavaScript
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

## Connect an AI client

The MCP server lets active administrators read and manage finance, reimbursement, and member records.
It does not accept pasted API keys or long-lived personal tokens.

1. Add `https://admin.cal.taxi/api/mcp` as a remote HTTP MCP server in your client.
2. Sign in with the same Google account that you use for the admin site.
3. Review the client name and permissions, then select **Allow access**.
4. Open `https://admin.cal.taxi/connections` to review or remove connected clients.

The server provides read and write tools for finance, reimbursements, and members.
Each call verifies an active administrator and writes a secret-free audit record.
Destructive tools require explicit confirmation, and create or payment tools accept retry-safe request IDs.

Production setup also requires these Supabase Auth settings:

- Enable the OAuth 2.1 server.
- Set the authorization path to `/oauth/consent`.
- Enable dynamic client registration.
- Use an asymmetric ES256 or RS256 JWT signing key.

Apply `supabase/config.toml` with `npx supabase config push`, then apply migrations
with `npx supabase db push`. Test discovery by requesting
`https://admin.cal.taxi/api/mcp/oauth-protected-resource`.
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

## Accreditation reports

`/accreditation` is an admin-only pilot for the Annual Report, Annual Budget,
and Big Brother Contract. It stores evidence and templates in private Supabase
Storage, keeps report revisions and citations in Postgres, snapshots current
Finance values for budget drafts, and archives approved official-format files.

Apply `supabase/migrations/20260916000000_accreditation_pilot.sql`, configure the
accreditation environment variables from `.env.example`, then upload and confirm
the three official templates before generating artifacts. Uploaded documents are
treated as untrusted evidence; only report definitions and explicit officer input
control generation. Gemini is the default language, embedding, and PDF provider;
the optional OpenAI language/embedding adapter remains available. PDF processing
uses Gemini. With no key, deterministic app snapshots and explicit `field = value`
overrides still work, while unsupported narrative fields remain unresolved.

## Gemini and published policies

Apply `supabase/migrations/20260917000000_gemini_policy.sql` after the pilot migration,
then apply `20260925000000_combined_policy_accreditation_search.sql` for the
administrator Ask Policy workspace.
The migration adds 768-dimensional vectors and HNSW indexes without replacing
legacy vectors. Search runs in Postgres: authorized, scoped chunks are ranked by
vector distance and full text (40 candidates each), then reciprocal-rank fusion
returns up to 18 report passages, 12 member-policy passages, or 24 combined policy
and accreditation passages for administrators. The filtered candidate
set is materialized for exact ranking so metadata isolation precedes ranking;
the HNSW indexes are available for later approximate-search tuning as corpus size grows.

Set the server-only configuration in `.env.example`. Never use a `NEXT_PUBLIC_`
name for Gemini credentials. The primary language default is `gemini-3.8-flash`,
with `gemini-3.5-flash-lite` as the automatic overload fallback. Set
`ACCREDITATION_LLM_MODEL=gemini-3.5-flash-lite` to use the lower-latency model as
the primary instead. PDF processing and embeddings keep their independently
configured models. Confirm those model IDs are available to the deployment account
before enabling generation.
Gemini Embedding 2 aggregates multi-input requests, so the adapter makes a separate
request per chunk, formats documents as `title: … | text: …`, and uses
`task: question answering | query: …` for questions. See the
[Google embedding documentation](https://ai.google.dev/gemini-api/docs/embeddings).

`/policy` accepts independent questions from active member/admin profiles. A
bounded date extraction step handles dates mentioned in questions; the date field
takes precedence and an unspecified date defaults to the current UTC date.
Ambiguous dates require clarification. Each answer uses only policies that are
published and effective for that date. Citation IDs and exact quotes are checked
locally, followed by a separate bounded grounding check. This is document guidance,
not event approval. There is no inferred hierarchy among issuing authorities.

`/accreditation/ask` searches both effective published policy and every ready,
non-template accreditation source with the active embedding profile. Results keep
their source class and document link so accreditation evidence or prior submissions
are not silently presented as authoritative policy. Exact passage quotes are checked
server-side for grounding, while the rendered bibliography appears once at the end
of the answer and groups all cited passages by their overall source document.

`/policy/library` lets administrators upload drafts, edit metadata, retry failed
processing, inspect extracted passages, publish, supersede, and archive. Published
content is immutable: upload a new version to change it and explicitly retire the
old one. Effective end dates are inclusive. Publication requires reviewed text and
locators, complete embeddings, title, authority, version and effective date.
Members receive originals through an authenticated, uncached download route;
draft and retired originals are restricted to administrators. Storage itself has
no member download policy. Question history is visible only to its author and
administrators; it stores the structured answer, source references/locators and
model profile, not a duplicate of every retrieved passage.

### Staged rollout

1. Apply the three accreditation and policy migrations in order. Inspect `supabase migration
   list --linked` and `supabase db push --dry-run` first; do not inadvertently apply
   unrelated pending migrations. The new migration also hardens the retained
   approval RPC's caller identity and fixes its table-specific immutability checks.
2. Deploy code with `ACCREDITATION_GEMINI_REPORTS_ENABLED=false`,
   `POLICY_ASSISTANT_ENABLED=false`, and `POLICY_ASSISTANT_MEMBERS_ENABLED=false`.
   Set `GEMINI_API_KEY` through the deployment's secret configuration.
3. In Accreditation → Evidence, use **Reprocess / re-embed** on each ready or failed
   source. Remove signatures first and confirm the source and extracted text are
   signature-free. Successful operations are idempotent. Each source switches
   profiles transactionally only after every chunk succeeds; old vectors and their
   provider metadata remain stored. Failed migration attempts preserve a ready
   legacy source and display an error for retry. Quota failures are retryable.
4. Confirm source profiles and review retrieval for cycle/term isolation, paraphrases,
   and exact numbers/times. Upload and confirm the actual Annual Report, Annual
   Budget, and Big Brother Contract templates. Render and visually inspect all
   three, checking signatures remain blank. Then enable
   `ACCREDITATION_GEMINI_REPORTS_ENABLED=true`. Budgets and contracts continue to use
   deterministic values and officer overrides; they do not invoke the language model.
5. Set `POLICY_ASSISTANT_ENABLED=true` with member access still false. Upload
   signature-free policies without unnecessary personal information as drafts.
   Compare extracted text and citation locators to each original, then explicitly
   publish. Evaluate a curated set of actual questions, including conflicts,
   superseded policies, missing event details and injection documents.
6. Enable `POLICY_ASSISTANT_MEMBERS_ENABLED=true` only after administrator evaluation.
   Member limits default to five questions per rolling minute and fifty per rolling
   24 hours, configured by `POLICY_QUESTIONS_PER_MINUTE` and
   `POLICY_QUESTIONS_PER_DAY`. Reservations are atomic and failed requests count.
   One question can make several bounded model requests, so reduce these limits
   when the account's free-tier quota requires it. Members get a retry message if
   Gemini capacity is unavailable.

Disable either feature with its feature flag to stop application access. No policy
is automatically published and no report is automatically approved. Archive or
supersede a policy to remove it from future retrieval; historical question answers
retain their original citations for audit, but source download checks run again.

### Verification

Run `npm run test:accreditation`, `npm run test:policy`, `npm run lint`, and
`npm run build`. Policy tests mock Gemini and execute both migrations in disposable
PGlite PostgreSQL with pgvector; they do not mutate the configured Supabase database.
They cover structured-output retries, dimensions, page extraction, quota errors,
unsupported citations/conclusions, event dates, hybrid retrieval, effective dates,
RLS, rolling limits, immutable approvals and preserved legacy embeddings.
The social-event fixture contains explicitly labeled test text, not actual
fraternity rules. Actual-model quality and official-template visual review remain
deployment acceptance checks requiring the key and official documents.

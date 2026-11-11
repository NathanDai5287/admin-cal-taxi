# Alumni Connect

Alumni Connect is an invitation-only opt-in list, with referrals and shared People profiles. The decision history is in [alumni-outreach-decisions.md](alumni-outreach-decisions.md).

## Setup before release

1. Apply `supabase/migrations/20261110000000_alumni_connect.sql` to the target Supabase project before deploying the application change. It adds profile identity fields and Connect tables, creates the managed **Alumni Connect** mailing list, grants the existing Alumni role Nu News read access, and restricts newsletter readers to final PDFs in database/storage policies. Existing full names, account roles, offices, orders, contracts, and signing links are preserved.
2. Verify `cal.taxi` in Resend so `Nu Chapter of Theta Xi <connect@cal.taxi>` can send. Set `RESEND_CONNECT_API_KEY` to a full-access key **in the same Resend account as `RESEND_BROADCAST_API_KEY`**. It falls back to the broadcast key, then `RESEND_API_KEY`. Full access is necessary to check existing contact opt-outs. This does not change hosting contract email configuration.
3. Set `ALUMNI_CONNECT_URL=https://cal.taxi` and `ALUMNI_CONNECT_REPLY_TO` to a monitored mailbox. Sending from `connect@cal.taxi` does not create an inbox or forwarding rule. For local end-to-end testing use `http://localhost:<port>` and an isolated Supabase project; do not send to real alumni during validation.
4. In **People → Alumni Connect**, review and send the initial invitations. People write permission is required. Search, delivery filters, total counts, and 50-row pagination support oversight of all invitations and profiles. Inviter identities remain visible internally when omitted from emails.
5. To send newsletters, select **Alumni Connect** in the existing mailing/broadcast workspace. Set `RESEND_BROADCAST_FROM_EMAIL=Nu Chapter of Theta Xi <connect@cal.taxi>` if that should also be the sender for broadcasts. Broadcast delivery, unsubscribe handling, and analytics use the existing Resend marketing integration. Do not manually edit the managed list's recipients; Connect refreshes them from consented subscriptions.

No production schema, DNS, inbox, Resend settings, subscriber data, or mail delivery is changed by the implementation tests.

## Recipient experience

- Invitations open `/connect/invitation/<random-token>`. GET does not subscribe, decline, or consume the invitation, so email scanners cannot accept it. Unused invitations have no time limit; acceptance, decline, or admin revocation closes them.
- Inviters can supply any subset of first name, last name, roll number, and graduation year. These are editable invitation defaults, never immediate profile updates. Email is required for delivery. Acceptance requires first and last name and explicit mailing consent; roll number and graduation year are optional.
- Changing the invited email requires a six-digit code sent to the new address. Codes last 15 minutes, allow five guesses, and are limited to one request per minute and five per hour per destination or invitation. Challenge cookies are HttpOnly; the database stores hashes, not raw tokens or codes.
- Acceptance creates or links the existing People profile and signs the recipient into Connect for seven days. New people have Alumni classification, base role none, and a connect_only cap: only Nu News read access is available, including after Google sign-in. A People editor must explicitly verify membership before standard role permissions apply. Existing verified people keep their established access.
- Original and verified replacement emails remain in permanent invitation history after declining, unsubscribing, or removal. Concurrent submissions cannot reserve an address twice. An unrelated unknown email cannot be inferred to belong to the same person.
- If a verified replacement already has an unused invitation, that invitation is retired and its history retained. Separate established profiles require chapter reconciliation; they are never silently merged.
- The welcome email links to `/connect`. Returning subscribers request an email code rather than reuse the consumed invitation as an account credential. Invite batches support 20 recipients; each inviter can create up to 50 invitations in a rolling 24 hours. The name checkbox starts checked and can be turned off before review/send.
- `/connect/news` respects the person's existing Nu News role grants and only serves completed issues. No editor or drafts are exposed to Connect readers.
- Existing read-only Nu News MCP clients are also restricted to completed issues; draft listing, details, and PDF links require write access.
- Recipients can unsubscribe from the welcome link or from Connect. Invites, unsubscribe links, and sessions have separate credentials; opening an unsubscribe link only displays a confirmation form.

## Profile and login linking

Profile identity fields are editable in People. Existing full names are not automatically split. Confirmed profile fields and existing membership/account privileges are not overwritten by referrals.

All Connect profile foreign keys follow the existing provisional-profile UUID change when someone first signs in with Google. Known aliases can claim a provisional profile; an alias of an already established Google account must use that original account or a Connect email code, rather than create a second person. The profile login email and Connect mailing email can differ.

## Sending and recovery

- Invitation identities are reserved in a database transaction before external sending. Each recipient is sent individually using a stable Resend idempotency key. Raw invitation links are not saved to the application database or the existing email activity/resend feature.
- Reservations are permanent, including uncertain sends. A timeout or interrupted request is never automatically retried, even after Resend's idempotency window. This prioritizes the agreed no-repeat rule; unknown/reserved sends cannot be released or resent. Definitive provider rejections are marked not_sent and an admin may explicitly release those unsent records. Preflight credential, sender, and Contacts failures reserve nothing.
- Recipients receive aggregate accepted/skipped/not-sent/unknown counts; existing subscription, decline, and replacement-address details are not disclosed to inviters. The optional profile fields are provided by the inviter, not looked up in People.
- Local unsubscribe/removal immediately removes Connect access and refreshes the managed list. It also queues a Resend opt-out. Before any broadcast preparation/send, pending opt-outs sync to Resend; a sync failure stops that broadcast. Existing provider-level opt-outs are respected when inviting and are never reset by broadcast imports.
- A welcome-email failure does not roll back successful enrollment or allow a second invitation. Recipients can manage their subscription using their active Connect session or sign in again by code.
- Removing a person in People blocks Connect sessions/referrals and queues their mailing opt-out without deleting profile or invitation history. Removing access in Alumni Connect blocks mailing/referrals. Restore access permits code sign-in but never silently restores consent: the person must explicitly rejoin. Broader membership permissions are managed in People/Roles.

## Validation

- `npm run test:alumni-connect`: profile defaults, normalization, consent, duplicate history, changed-address verification, code limits, terminal responses, provisional profile linking, concurrent submissions, referral limits, database permissions, final-only newsletter policies, sender identity, and uncertain-delivery behavior with mocked transports.
- `npm run test:broadcasts`: includes stopping a prepared broadcast until Connect opt-outs can sync.
- `npm run build` and `npx tsc --noEmit`.
- `node scripts/alumni-connect-preview.mjs`: loopback-only preview at `http://127.0.0.1:4182`; `/accept` shows illustrative defaults. It blocks production dependencies and substitutes all email/server actions. Desktop/mobile browser checks cover review/send, editable defaults, replacement code gating, overflow, and browser errors.

Live delivery and Google-provider linking should be exercised in an isolated staging project after applying migrations and configuring the verified sender. They were not exercised against production during implementation.

The broader Nu News suite has an unrelated local failure in `scripts/nu-news.test.mjs`: “a typst CLI build of the same input has the same pages and text.” The same failure was reproduced from an archived, unchanged baseline; it compares the installed Typst CLI output to the Node compiler output. The Connect tests, Nu News reader/database/MCP checks, members tests, broadcast tests, targeted lint, TypeScript, and production build pass.

## Review and operation

The comments in `~/Downloads/a.txt` were validated and resolved in [alumni-connect-review.md](alumni-connect-review.md). The database fixture now uses real mailing-list constraints and role defaults. A per-page Resend check records provider opt-outs and check timestamps; status is labeled local until checked. Possible duplicate profiles are flagged rather than automatically merged.

To invite known alumni, open `https://admin.cal.taxi/users/alumni`, enter an email and any known name/roll number/graduation year for each brother, use Add another brother for more recipients (up to 20), choose name attribution, select Review invitations, then Send invitations. Up to 50 new invitations may be created per rolling 24 hours. Existing list subscribers, Resend contacts, and previously invited addresses are skipped. An address book alone is not evidence of consent, so stale known contacts remain eligible for a confirmation invitation. Each recipient gets a private link from `connect@cal.taxi`; do not forward a personal invitation as a reusable public signup link.

Production Connect uses its own full-access Resend key, separate from the hosting sender key. Replies use the chapter's existing published address, `calthetaxi@gmail.com`. Sending email does not create a `connect@cal.taxi` inbox. The per-destination code limit may be exhausted by an anonymous requester; a browser quota and two-destination replacement limit bound abuse but are not claimed to prevent distributed attacks.

The admin page opens on Invite brothers. Invitations contains searchable invitation history and withdrawal/recovery actions. Alumni contains subscription/access management and provider checks. Explanations of sending and subscription states are available in each view.

After acceptance, the recipient sees confirmation and an Invite your brothers button leading to `/connect?joined=1`. That page shows a brief green success toast and the referral form. Subscription settings contains their email, unsubscribe action and sign-out control; Nu News is linked near the heading. A previously removed People profile remains blocked until deliberately restored by an administrator. Failed acceptance leaves the invitation unused and shows the chapter contact action; it never silently reactivates an account.

The Alumni admin view includes a compact directory of profile details, sent invitation totals, original inviter, subscription status, and per-row management controls. Totals include the full sending history, not just the current page. The retired `/mailing-list` app redirects here; existing mailing data and the shared Nu News/email delivery infrastructure remain intact.

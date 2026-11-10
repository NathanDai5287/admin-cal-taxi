# Alumni Connect

Alumni Connect is an invitation-only opt-in list, with referrals and shared People profiles. The decision history is in [alumni-outreach-decisions.md](alumni-outreach-decisions.md).

## Setup before release

1. Apply `supabase/migrations/20261110000000_alumni_connect.sql` to the target Supabase project before deploying the application change. It adds profile identity fields and Connect tables, creates the managed **Alumni Connect** mailing list, grants the existing Alumni role Nu News read access, and restricts newsletter readers to final PDFs in database/storage policies. Existing full names, account roles, offices, orders, contracts, and signing links are preserved.
2. Verify `cal.taxi` in Resend so `Nu Chapter of Theta Xi <connect@cal.taxi>` can send. Set `RESEND_CONNECT_API_KEY` to a full-access key **in the same Resend account as `RESEND_BROADCAST_API_KEY`**. It falls back to the broadcast key, then `RESEND_API_KEY`. Full access is necessary to check existing contact opt-outs. This does not change hosting contract email configuration.
3. Set `ALUMNI_CONNECT_URL=https://cal.taxi` and `ALUMNI_CONNECT_REPLY_TO` to a monitored mailbox. Sending from `connect@cal.taxi` does not create an inbox or forwarding rule. For local end-to-end testing use `http://localhost:<port>` and an isolated Supabase project; do not send to real alumni during validation.
4. In **People → Alumni Connect**, review and send the initial invitations. People write permission is required. The latest 100 invitations and subscriptions are shown for oversight. Inviter identities remain visible internally when omitted from emails.
5. To send newsletters, select **Alumni Connect** in the existing mailing/broadcast workspace. Set `RESEND_BROADCAST_FROM_EMAIL=Nu Chapter of Theta Xi <connect@cal.taxi>` if that should also be the sender for broadcasts. Broadcast delivery, unsubscribe handling, and analytics use the existing Resend marketing integration. Do not manually edit the managed list's recipients; Connect refreshes them from consented subscriptions.

No production schema, DNS, inbox, Resend settings, subscriber data, or mail delivery is changed by the implementation tests.

## Recipient experience

- Invitations open `/connect/invitation/<random-token>`. GET does not subscribe, decline, or consume the invitation, so email scanners cannot accept it. Unused invitations have no time limit; acceptance, decline, or admin revocation closes them.
- Inviters can supply any subset of first name, last name, roll number, and graduation year. These are editable invitation defaults, never immediate profile updates. Email is required for delivery. Acceptance requires first and last name and explicit mailing consent; roll number and graduation year are optional.
- Changing the invited email requires a six-digit code sent to the new address. Codes last 15 minutes, allow five guesses, and are limited to one request per minute and five per hour per destination or invitation. Challenge cookies are HttpOnly; the database stores hashes, not raw tokens or codes.
- Acceptance creates or links the existing People profile and signs the recipient into Connect for seven days. New people receive Alumni membership with existing role-based permissions, including Nu News reading. No privileged app access comes from referral details or roll numbers.
- Original and verified replacement emails remain in permanent invitation history after declining, unsubscribing, or removal. Concurrent submissions cannot reserve an address twice. An unrelated unknown email cannot be inferred to belong to the same person.
- If a verified replacement already has an unused invitation, that invitation is retired and its history retained. Separate established profiles require chapter reconciliation; they are never silently merged.
- The welcome email links to `/connect`. Returning subscribers request an email code rather than reuse the consumed invitation as an account credential. Invite batches support 20 recipients; each inviter can create up to 50 invitations in a rolling 24 hours. The name checkbox starts checked and can be turned off before review/send.
- `/connect/news` respects the person's existing Nu News role grants and only serves completed issues. No editor or drafts are exposed to Connect readers.
- Recipients can unsubscribe from the welcome link or from Connect. Invites, unsubscribe links, and sessions have separate credentials; opening an unsubscribe link only displays a confirmation form.

## Profile and login linking

Profile identity fields are editable in People. Existing full names are not automatically split. Confirmed profile fields and existing membership/account privileges are not overwritten by referrals.

All Connect profile foreign keys follow the existing provisional-profile UUID change when someone first signs in with Google. Known aliases can claim a provisional profile; an alias of an already established Google account must use that original account or a Connect email code, rather than create a second person. The profile login email and Connect mailing email can differ.

## Sending and recovery

- Invitation identities are reserved in a database transaction before external sending. Each recipient is sent individually using a stable Resend idempotency key. Raw invitation links are not saved to the application database or the existing email activity/resend feature.
- Reservations are permanent, including uncertain sends. A timeout or interrupted request is never automatically retried, even after Resend's idempotency window. This prioritizes the agreed no-repeat rule; an uncertain/reserved invitation can require chapter support, rather than an automatic replacement message.
- Recipients receive neutral processing results; existing subscription, decline, and replacement-address details are not disclosed to inviters. The optional profile fields are provided by the inviter, not looked up in People.
- Local unsubscribe/removal immediately removes Connect access and refreshes the managed list. It also queues a Resend opt-out. Before any broadcast preparation/send, pending opt-outs sync to Resend; a sync failure stops that broadcast. Existing provider-level opt-outs are respected when inviting and are never reset by broadcast imports.
- A welcome-email failure does not roll back successful enrollment or allow a second invitation. Recipients can manage their subscription using their active Connect session or sign in again by code.
- Removing a person in People blocks Connect sessions/referrals and queues their mailing opt-out without deleting profile or invitation history. Removing a subscription in Alumni Connect blocks mailing/referrals; broader membership permissions are managed in People/Roles.

## Validation

- `npm run test:alumni-connect`: profile defaults, normalization, consent, duplicate history, changed-address verification, code limits, terminal responses, provisional profile linking, concurrent submissions, referral limits, database permissions, final-only newsletter policies, sender identity, and uncertain-delivery behavior with mocked transports.
- `npm run test:broadcasts`: includes stopping a prepared broadcast until Connect opt-outs can sync.
- `npm run build` and `npx tsc --noEmit`.
- `node scripts/alumni-connect-preview.mjs`: loopback-only preview at `http://127.0.0.1:4182`; `/accept` shows illustrative defaults. It blocks production dependencies and substitutes all email/server actions. Desktop/mobile browser checks cover review/send, editable defaults, replacement code gating, overflow, and browser errors.

Live delivery and Google-provider linking should be exercised in an isolated staging project after applying migrations and configuring the verified sender. They were not exercised against production during implementation.

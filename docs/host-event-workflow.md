# Hosting event workflow

The administrator order page at `/host/orders/[id]` uses the approved timeline direction from `previews/order-flow/02-timeline.html`. It puts document actions beside event milestones and keeps rental payments and fire-permit payments in a separate finance section. Editing agreement details remains in the existing order editor.

This extends the private administrator interface. It uses the existing Inter stack, brand blue, white surfaces, fine gray borders, shared compact buttons, and field styles from `app/brand.css` and `components/brand/button.tsx`. The public-site rules in root `DESIGN.md` do not apply to this workflow; that file and `.impeccable/design.json` are preserved. Future role/profile changes are outside this work.

## Event stages

| Stage | Automatic source |
| --- | --- |
| Draft | No evidence that the current agreement was sent. |
| Sent | An invitation was accepted by the email service, a delivery acknowledgement or signature exists, or an existing envelope predates workflow activation. |
| Signed | The current signing revision is signed, or all its recipients have signed. Completed downloads appear when the stored files are ready. |
| Event held | A sent event's date is earlier than today's date in `America/Los_Angeles`, including Berkeley daylight-saving changes. Missing signatures remain visible. |
| Cancelled | Cancellation recorded in workflow metadata or the existing order cancellation override. |

The stages do not require manual status selection. A newer inert contract preview does not supersede the active agreement. Existing envelopes, approved PDF bytes, private signing links, and signing history remain in use.

Cancellation stops future hosting emails and removes the event from the forecast. It preserves recorded payments, documents, and signing history, including active personal links. It does not revoke those links.

## Administrator flow

1. Prepare and approve the contract through the existing editor. On the order timeline, open the approved PDF and select **Review & send contract**. Review each individual recipient's email and attachment before sending.
2. Watch the signer list and counts. Invitations and reminders contain only that recipient's private signing link. Reminders target unsigned recipients and are limited to once per person per Berkeley calendar day; eligibility is checked again at send time.
3. Signature progress refreshes on initial load, window focus, and every 60 seconds while the visible page is idle. The Documenso webhook also refreshes progress. Once both the exact completed contract and audit PDF are stored, the workflow automatically emails both files to every signer. Duplicate refreshes reuse delivery records.
4. Review and manually send the deposit invoice, due seven days before the event, and the rental invoice, due two days after it. These due dates do not schedule invoice emails. Manual document defaults use saved renter signers. The document recipient set is restricted to renter emails saved with the agreement rather than every chapter signer.
5. Record rental receipts and fire-permit payments independently in **Finances**. Fire permits remain Socials expenses. Refundable deposits are excluded from rental revenue. Payment history retains reversals.
6. After recording rental payments, review and send the receipt. After full rental payment, enter the deposit amount actually returned, return date, and method, then review the return confirmation. This records and communicates a return already made; it does not transfer money.

Each preview freezes the recipient-specific body and exact attachment bytes in the private outbox. Attachment preview links expose those same frozen bytes through authenticated administrator routes. Sending rechecks the current revision, cancellation, agreement terms, and relevant payment records; changed terms or payments require a fresh preview. Invoice, receipt, and deposit-return sends require an explicit administrator action.

Sent events enter the forecast automatically. An existing confirmed forecast keeps its original rental and permit terms even after an authorized agreement replacement. The finance panel displays any disagreement with current saved terms. Any later financial correction must retain the original confirmed history and actual payment records.

## Email setup and recovery

The configured sender is `Theta Xi Hosting <host@cal.taxi>` with Reply-To `nathan.dai@berkeley.edu`. Domain verification and production environment configuration were completed during this implementation session. No actual setup emails were sent, so this is not evidence of live recipient delivery.

| Server variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Server-only Resend API access. |
| `HOST_EMAIL_FROM` | Verified sender; defaults to `Theta Xi Hosting <host@cal.taxi>`. |
| `HOST_EMAIL_REPLY_TO` | Required reply destination. |
| `HOST_BACKEND_ORIGIN`, `HOST_BACKEND_KEY` | Existing authenticated order, signing, and PDF archive. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Workflow database connection and server-only privileged access. |
| `DOCUMENSO_WEBHOOK_SECRET` | Existing authenticated signing webhook. |

Keep secret values, personal signing links, and private baseline files out of source control and documentation. Existing signing infrastructure is described in [Hosting contract signing](host-signing.md); this workflow adds application-owned Resend emails to that signing integration.

The outbox uses row-level security with no browser-client policies. Anonymous and authenticated roles have no table privileges; only the service role reads and writes its private payloads. Administrator actions authorize access separately.

Delivery retries reuse the frozen payload and `hosting/<delivery-id>` idempotency key. The implementation accounts for Resend's 24-hour idempotency window and stops automatic retry eligibility 23 hours after the first attempt. A stale in-flight claim can be reclaimed after 90 seconds within that window. An ambiguous older attempt becomes **uncertain** and requires an operator to check Resend logs before deciding what to do; do not blindly create a new delivery. **Accepted by email service** records API acceptance, not inbox delivery.

## Additive rollout and preservation

Apply the repository's normal database migration procedure with these migrations in order:

1. `supabase/migrations/20261006000000_hosting_event_email.sql` adds workflow settings, cancellation/refund metadata, signing references, and the private outbox with delivery claims.
2. `supabase/migrations/20261006001000_hosting_forecast_atomic.sql` adds atomic forecast inclusion with cancellation checks.

After migration, run the initializer using the configured server environment:

```powershell
node --env-file-if-exists=.env.local scripts/host-workflow-initialize.mjs
```

The initializer registers existing envelope routes and adds eligible previously sent agreements to the forecast. It does not overwrite an existing finance row, mutate the order/signing backend, or send emails. Its inserts are additive and safe to repeat.

The read-only preservation verifier requires a private baseline captured before the rollout. It reads the temporary `host-order-preservation-path.txt` pointer and the referenced `baseline.json`; it does not create either. Keep those artifacts outside the repository. With that prerequisite and the authenticated archive environment available:

```powershell
node --env-file-if-exists=.env.local scripts/host-order-preservation.mjs
```

It checks stored terms and documents, existing revision and envelope identities, approved PDF SHA-256 values, unchanged personal-link hashes, and that existing requests were not cancelled. Missing baseline artifacts prevent this verifier from establishing preservation.

## Review evidence

The isolated desktop/mobile timeline and email-preview screenshots were validated at `.impeccable/review/desktop.png`, `mobile.png`, `desktop-email.png`, and `mobile-email.png`. They document the layout and fixture states, not production mail delivery. Source inspection confirms reuse of incumbent admin tokens, buttons, and fields.

The initial finish review requested payment failure handling. The implementation now catches record/reversal failures, rolls back optimistic state, releases busy state in `finally`, and retains controlled payment fields for retry. The final finish review returned **ship** after validating all four captures and the payment recovery fix. Relevant local checks are `scripts/host-event.test.mjs` and `scripts/host-email.test.mjs`; report their actual results separately from screenshot evidence.

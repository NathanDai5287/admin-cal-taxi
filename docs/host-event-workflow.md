# Hosting event workflow

The administrator order page at `/host/orders/[id]` uses the approved timeline direction from `previews/order-flow/02-timeline.html`. A minimal finance row at the top shows rental and fire-permit totals with their payment actions. Below it, the event timeline sits on the left and a sticky email/PDF preview pane sits on the right. On mobile these areas stack, and selecting a document or email scrolls to its preview. Editing agreement details remains in the existing order editor.

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

Selecting an email action immediately renders a recipient-specific draft with the same pure template used for delivery. That local draft has no delivery ID or attachment list and cannot be sent. The pane shows preparation progress, then replaces the draft with the saved outbox preview once its IDs and attachments are ready. Preparation failures leave the draft visible with retry feedback. Action feedback uses one live announcement immediately beneath the Preview heading.

Background preparation freezes the recipient-specific body and exact attachment bytes in the private outbox; it sends no email. Attachment preview links expose those same frozen bytes through authenticated administrator routes. Sending rechecks the current revision, cancellation, agreement terms, relevant payment records, and signer eligibility after synchronizing signature status; changed terms or payments require a fresh preview. Invoice, receipt, and deposit-return sends require an explicit administrator action. The existing automatic completed-contract delivery in signature refresh remains a separate workflow.

### Preview preparation and cache boundaries

Eligible previews start concurrently through the same-origin, administrator-authorized `POST /api/host/orders/[id]/email-previews` route, avoiding the browser Server Action queue. The response is private and `no-store`. Preview preparation reads archived signing state without synchronizing Documenso. Server preparation reuses matching saved outbox rows before generating attachments and inserts missing recipient rows as one batch with duplicate request-key protection.

Invitation prewarming is restricted to a new unsent agreement or an invitation batch with previously incomplete deliveries. An existing sent signing request is preserved without creating new invitations merely because the page loads. Sent events may prepare reminders and invoices; receipts require recorded rental payments, and return confirmations require eligible return details. These requests prepare previews only.

The mounted timeline owns bounded memory caches: at most 32 email request promises and 12 PDF requests/Blob URLs. Concurrent clicks and background preparation reuse the same promise. Email keys include the order version, signing revision and recipient statuses, rental payment total, Berkeley day, cancellation, email kind, and return details where relevant. A scope change hides the stale selected preview; final delivery independently checks current server state. PDFs use their authorized document URL as the key. Both fetch paths use `no-store`; private previews are not put in local storage, shared browser caches, or a process-wide server cache. Email cache failures are evicted for retry, and a successful send clears that cache. PDF failures are evicted; Blob URLs are revoked on eviction, unmount, and completion after an entry has already been removed.

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

The revised isolated captures are [desktop timeline](../.impeccable/review/desktop-revised.png), [mobile timeline](../.impeccable/review/mobile-revised.png), [desktop email](../.impeccable/review/desktop-revised-email.png), and [mobile email](../.impeccable/review/mobile-revised-email.png). Feedback placement is recorded in [desktop feedback](../.impeccable/review/desktop-preview-feedback.png) and [mobile feedback](../.impeccable/review/mobile-preview-feedback.png). All six were viewed and validated during the implementation session. They document sample layout and fixture states, not production mail delivery. Source inspection confirms reuse of incumbent admin tokens, buttons, and fields.

The initial finish review requested payment failure handling. The implementation catches record/reversal failures, rolls back optimistic state, releases busy state in `finally`, and retains controlled payment fields for retry. The fresh review of the revised layout requested moving action feedback from beneath the long timeline to the preview pane. That fix is implemented and appears in the two feedback captures; the reviewer returned **ship at that fix scope**. This verdict covers the reviewed interface and recovery behavior, not production delivery or deployment.

The implementation session recorded 28 passing targeted tests across `scripts/host-event.test.mjs`, `scripts/host-email.test.mjs`, `scripts/host-preview-cache.test.mjs`, `scripts/host-order-signing.test.mjs`, and `scripts/finance-plan.test.mjs`, and a passing final production build after the feedback placement fix. The read-only preservation verifier passed checks for the approved original PDF, existing envelope/revision identities, six personal-link hashes, and stored terms/documents before deployment. These checks do not establish deployment completion; the deployed ref/commit and preservation must be checked after production rollout.

Cold iframe fixture measurements showed the local email draft in 15.5 ms on desktop and 17.2 ms on mobile while preview network responses were deliberately delayed by 1,800 ms. That measures draft rendering in the fixture, not authenticated server preparation, PDF generation, or production latency. The final fixture checks reported no page errors and exactly one action-feedback announcement on each viewport. Desktop physical interaction checks covered actions and payment retry. Mobile preview switching used DOM-dispatched events because headless iframe hit testing was unstable; this does not establish touch interaction evidence.

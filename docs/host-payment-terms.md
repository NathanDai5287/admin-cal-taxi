# Hosting rental payment deadline

New contracts require the full rental fee by **11:59 p.m. Pacific Time on the calendar day immediately before the event date**. Pacific Time means America/Los_Angeles, including daylight saving time. The separate security deposit remains due seven days before the event and is returned after the event, subject to the contract.

This release integrates PR #7's direct contract approval and email review flow with the shared payment schedule already on main. It uses the existing `rentalPaymentTiming` snapshot field (`day_before` or `after_conclusion`) and `rental_payment_timing` generator input. There is no second payment-policy field. Historical snapshots without a timing field retain their original after-conclusion terms; overnight events conclude on the next calendar day. Issued invoice due text and attempted email deliveries remain frozen.

The timeline places rental invoicing and payment before the event for new contracts and after it for legacy contracts. Payment messages list the milestones chronologically. Contract summaries, invoice defaults, rental PDF terms, deposit invoice terms, and copied instructions show the advance deadline. Deposit return remains after the event and full rental payment; returning a deposit before an overnight event's conclusion date is blocked. PR #7's Review contract → Approve contract → Review emails → Send flow is preserved, including separate approval and sending.

New Create drafts and duplicated events use advance payment. An unissued saved draft can adopt it after checking signing history. Existing contract documents, pending or signed requests, and uncertain or processing requests retain their saved timing. Preview preparation never changes an existing order; explicit activation saves reviewed replacement terms.

## Backend release and preservation

The companion generator repository is `../theta-xi-rental-signing-work` (GitHub: NathanDai5287/theta-xi-rental-contract). Its `main` branch contains versioned contract and invoice wording. No database backfill or schema migration is needed. Missing timing inputs reproduce the original wording. Approved snapshots and generated payloads must agree; ordinary edits cannot change payment timing on pending or signed contracts.

New contract PDF responses acknowledge `X-Rental-Payment-Timing: day_before`; signing revisions expose the corresponding `rentalPaymentTiming`. The admin blocks new contract previews if the backend cannot acknowledge the policy. This prevents a frontend-only deployment from showing advance payment dates while generating old contract wording.

Before deployment, capture a private read-only baseline of all live orders, their snapshots/documents, envelope identities, personal-link hashes, and exact original/completed/audit PDF hashes. Back up the live SQLite database using its online backup API and archive signing files outside the checkout. Deploy the companion backend from its main commit, then publish the admin main commit. Compare all baseline orders, links, envelopes, and file hashes afterward; do not resubmit signatures, recreate requests, or cancel envelopes during verification.

Validation includes real contract and invoice rendering, fake-provider signing and preservation tests, chronological timeline/message rendering, DST/year/leap-day boundaries, historical invoice preservation, separate approval/send behavior, TypeScript, lint, and the production build. Deployment completion requires verifying the Git branch and commit behind both services.

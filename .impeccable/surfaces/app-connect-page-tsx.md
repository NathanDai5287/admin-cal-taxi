---
version: 1
slug: app-connect-page-tsx
primary_target: app/connect/page.tsx
related_targets:
  - components/alumni-connect/invite-form.tsx
  - app/connect/public-forms.tsx
  - app/connect/invitation/[token]/page.tsx
  - app/(admin)/(members)/users/alumni/page.tsx
---

Mode: Operate. Audience: invited alumni reconnecting with Nu Chapter, plus staff seeding and overseeing invitations. Extend the existing chapter brand and private field/button system; no shared visual identity replacement.

The form uses one structured entry per brother with email, first name, last name, roll number, and graduation year visible. Only email is required. Add another brother appends an entry; raw email paste was removed at the user’s request. Named/anonymous invitation preview appears during explicit review before sending. The allowance reads “You can send __ more invitations today.” Admins use separate Invite brothers, Invitations, and Alumni views; search, management tables, and status help appear in their relevant view. Empty views offer clear next steps without empty table headings or pagination. Members navigation orders People, Roles, Alumni Connect and remains visible on mobile. Recipients retain editable defaults and replacement-email verification. Identity fields pair on desktop and normal mobile widths, stacking below 360px. Permanent duplicate history and private subscription states remain enforced server-side.

Desktop/mobile fixture screenshots and browser interaction checks cover recipient entry, review/send, editable acceptance defaults, email verification gating, overflow, and browser errors. Verdict: pass for those surfaces. The isolated preview uses synthetic data and mocked actions; it does not prove live Resend delivery or staging Google account linking. Existing design tokens and components remain the visual authority. No raster assets were introduced.

The simplification was verified with desktop and mobile synthetic fixtures, including dark theme, all five fields, multiple recipients, review/send payloads, empty management views, browser errors, and horizontal overflow. All 30 existing Connect tests, targeted lint, TypeScript and production build passed. No live emails were sent.

Join outcome refinement: successful acceptance has persistent confirmation and an Invite your brothers action, including after cookie-driven server rerenders. The Connect referral page uses a green dismissible eight-second toast after joining; its heading stays Invite your brothers. Removed profiles show a red actionable non-subscription state without reactivation. Sending results use a short count, omit zeros, and disclose delivery caveats on demand. Subscription settings collapse the email, unsubscribe and sign-out controls; Nu News is available near the heading. Future invitation CTAs say Reconnect with Nu Chapter. Verified with 35 Connect tests and bounded desktop/mobile/dark fixture checks, including toast dismissal and timeout. No production email or profile changes were made during validation.

Read Nu News is a prominent filled brand button near the heading, with a 48px minimum target, replacing the understated underlined link. Existing access checks remain in force.

The admin Alumni view is a compact directory: first/last name, email, roll, class, invitations sent, original inviter and status, with management disclosed per row. It uses a wider desktop reading area and keyboard-scrollable table on small screens. The standalone Mailing List UI is retired and redirects here; shared email/publication functions and data are retained.

Directory finish: desktop and mobile fixture checks passed with populated, missing-field, unsubscribed, and access-removed rows. Table scrolling stays within the region on mobile; row actions remain available. Connect (36), access and broadcast tests pass.

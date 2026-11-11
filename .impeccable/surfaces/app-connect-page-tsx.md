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

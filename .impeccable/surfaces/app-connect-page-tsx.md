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

The form keeps each email compact with optional profile details, offers bulk email paste, previews named/anonymous invitation wording, and requires an explicit review before sending. Recipients receive editable defaults and verify a replacement email before joining. Mobile uses a single column; desktop pairs identity fields. Permanent duplicate history and private subscription states are enforced server-side.

Desktop/mobile fixture screenshots and browser interaction checks cover recipient entry, review/send, editable acceptance defaults, email verification gating, overflow, and browser errors. Verdict: pass for those surfaces. The isolated preview uses synthetic data and mocked actions; it does not prove live Resend delivery or staging Google account linking. Existing design tokens and components remain the visual authority. No raster assets were introduced.

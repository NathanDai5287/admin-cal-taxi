# Alumni outreach decision log

Started: November 10, 2026.

This is the running record of the alumni outreach discussion. Update it as decisions change; preserve superseded decisions so the reason for a change remains clear. Agreed decisions, recommendations, and open questions are deliberately distinguished. This document records intended behavior, not completed implementation.

## Purpose and initial scope

- Reconnect brothers and alumni who want chapter news and opportunities to participate.
- Start with email invitations that spread through alumni referrals: chapter staff invite initial alumni, who can invite classmates and other brothers by entering a list of email addresses.
- Recipients can join, decline, or choose a different email address. The same flow should offer referrals, with sending enabled after enrollment.
- Phone outreach, alumni event discovery, a public/alumni calendar, and easier contact with the chapter are potential later work. SMS is outside the initial scope.
- Users/People is the proposed administrative home, integrated with the existing mailing tools. Exact navigation is still open.

## Agreed decisions

### Enrollment and oversight

- Send an invitation, rather than subscribing someone just because another alumnus entered their address.
- Use automatic enrollment after the recipient accepts and verifies their email, with admin removal available. This replaces the earlier selection of individual admin approval.
- Referrals provide context but do not prove alumni identity. Do not represent the list as a verified alumni directory solely because someone was invited.

### Email changes and duplicate invitations

- Accepting with another email requires a verification code sent to that new address and entered on the page before enrollment at that address.
- Never send another invitation to an address already invited, or to a verified replacement address associated with that invitation.
- Example: invited at a personal address, then accepted at a verified school address. Future referrals to either address must send no invitation email.
- Keep invitation history separate from current subscription state so deduplication survives removal, decline, and unsubscribe.
- Deduplication can cover known addresses; recognizing an unrelated, previously unknown address as the same person is not guaranteed.

### Sender identity and inviter attribution

- Use the chapter name “Nu Chapter of Theta Xi.”
- Chosen sending identity: `Nu Chapter of Theta Xi <connect@cal.taxi>`. Domain verification and production configuration are still pending; this choice alone does not configure delivery or a reply inbox.
- Invitations should describe an alumni referral; allow inviters to choose whether their name appears in the outgoing invitation.
- Named example, subject to final copy: “Nathan Dai, a fellow alumnus, invited you to reconnect with the Nu Chapter of Theta Xi.”
- Anonymous example, subject to final copy: “A fellow alumnus invited you to reconnect with the Nu Chapter of Theta Xi.”
- Attribution checkbox default has not been agreed.

### Profiles and permissions

- Incorporate alumni into the existing people/profile and permission system rather than maintain an independent alumni profile directory.
- Track first name, last name, roll number (for example, Nu 1048), and graduation year (for example, Class of 2027) in the shared profile system.
- Alumni should have access to selected tools, including Nu News. Exact access levels and reader experience remain to be defined.
- Mailing-list enrollment and access to privileged administrative tools are separate concerns.

## Recommendations proposed, not yet confirmed

- Let alumni subscribe without a login; link a subsequent verified sign-in to the existing person record rather than creating a duplicate.
- Require first and last names; make roll number and graduation year optional so forgotten information does not block enrollment.
- Preserve existing full names during migration rather than blindly splitting them. Do not merge profiles automatically based on self-reported roll numbers.
- Keep the inviter's identity internally even when omitted from the email.
- Use a chapter-controlled sender with a monitored reply-to address.
- Keep original invitation links valid until accepted, declined, or revoked; expire replacement-email verification after 24 hours. Code expiration and retry rules still need a specific design.
- Opening an invitation must not change enrollment state; email scanners can open links.
- Limit revocation to admins; let inviters report mistakes rather than withdraw another person's invitation themselves.
- Retain declines and unsubscribe history; do not reinvite or silently resubscribe these addresses.
- Allow recipient-requested verification messages despite the prohibition on repeat invitation emails.
- Reserve a replacement email during verification, permanently associate it only after verification, and release abandoned reservations. Exact reservation behavior is unresolved.
- Enforce deduplication atomically, including simultaneous referrals; cap referral sending to limit abuse.
- Do not disclose another person's subscription status or replacement address to the inviter.

## Email infrastructure: findings and pending choices

Repository inspection on November 10, 2026 found:

- Existing mailing-list address book, saved lists, and Resend Broadcasts integration. Reuse these where appropriate.
- Broadcast sender selection: `RESEND_BROADCAST_FROM_EMAIL`, falling back to `RESEND_FROM_EMAIL`.
- `.env.example` proposes `Theta Xi Nu Chapter <news@cal.taxi>` for broadcasts and `Theta Xi <invites@cal.taxi>` for ordinary sending. These are examples, not confirmation of production configuration.
- Broadcasts already support a separate `RESEND_BROADCAST_API_KEY`, falling back to `RESEND_API_KEY`.
- The local environment inspected did not define those sender settings. The production sender has not been verified.
- Resend Broadcasts supports marketing emails to contacts/segments, topics, and campaign tracking: <https://resend.com/docs/dashboard/broadcasts/introduction>.
- Resend distinguishes its `/emails` sending API from its `/broadcasts` marketing API: <https://resend.com/pricing>.

Pending decisions:

- Verify and configure the chosen mailing sender, `connect@cal.taxi`, and choose a monitored reply-to inbox. The user wants a mailing-specific sender and is interested in Resend's marketing tools.
- Proposed split: Broadcasts for subscribed alumni newsletters and announcements; individual sending for recipient-specific invitations and verification codes. Confirm handling of invitation opt-outs and provider suppression before implementing.
- Decide whether a separate sending subdomain is warranted; a different address alone does not isolate domain reputation.

## Permission infrastructure: findings and pending choices

- The repository already has `alumni` membership and an Alumni role in the permission UI.
- The alumni migration seeds reimbursement submission access but no Nu News access. This describes repository defaults, not verified live settings.
- The existing Nu News app lists drafts as well as final issues. Simply granting its current read access would not necessarily deliver a published-newsletter-only experience.
- Proposed alumni experience: read published Nu News issues, without editing or access to unpublished drafts. Confirm this scope and enforce it on every relevant page, data request, and download.
- Automatic subscription should not automatically grant access to sensitive tools on the strength of an unverified alumni claim. Determine whether published-news access is sufficient or whether additional membership validation is needed for future tools.

## Decision history

1. Initial concept: recursively referred email invitations, with optional later phone and event features.
2. Initially selected admin approval plus email verification for every new alumnus.
3. Revised direction to automatic enrollment after acceptance/verification, with admin removal.
4. Required no repeat invitation to the original address or verified replacement address.
5. Required verification codes for replacement addresses and identified shared profile fields.
6. Chose chapter wording and optional inviter name disclosure.
7. Expanded scope to shared alumni profiles and selected tool access, including Nu News; requested a mailing-specific sender and consideration of Resend marketing.
8. Requested this ongoing decision log.
9. Chose `connect@cal.taxi` as the sending address, with display name “Nu Chapter of Theta Xi.”

## Implementation status

This discussion has not yet implemented or deployed the referral feature, profile changes, sender configuration, or alumni Nu News access. The existing application findings above are context, not a claim that these decisions have shipped.

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
  Implementation default: checked, with the exact name displayed and an option to turn it off before review/send.

### Profiles and permissions

- Incorporate alumni into the existing people/profile and permission system rather than maintain an independent alumni profile directory.
- Track first name, last name, roll number (for example, Nu 1048), and graduation year (for example, Class of 2027) in the shared profile system.
- Alumni should have access to selected tools, including Nu News. Exact access levels and reader experience remain to be defined.
- Mailing-list enrollment and access to privileged administrative tools are separate concerns.

### Inviter-supplied profile defaults

- For each recipient, the inviter can optionally provide any subset of the profile fields being collected: first name, last name, roll number, and graduation year. A destination email is still required to send an email invitation.
- When the recipient accepts, prefill the acceptance form with the supplied values and the invited email address. Every field remains editable by the recipient; changing the email still requires the verification-code flow.
- Omitted fields remain blank. The inviter does not need to know all of another person's information to invite them.
- Store inviter-supplied values as invitation defaults, not as recipient-confirmed profile facts. The recipient's submitted values are authoritative for this acceptance flow; do not use referrals to overwrite an existing confirmed profile.
- This replaces the email-only page proposal. The presentation of optional fields and bulk entry is still a design proposal.

### Approved email templates

- The user approved the proposed templates: named invitation, anonymous invitation, replacement-email verification code, and welcome after enrollment.
- Named invitation subject: “{{inviter_first_name}} invited you to reconnect with Theta Xi.” Anonymous invitation subject: “An invitation to reconnect with the Nu Chapter of Theta Xi.”
- Invitation action: “Choose your preferences,” opening Join, Use a different email, and No thanks. Explain that subscription requires acceptance.
- Verification subject: “Verify your email for the Nu Chapter of Theta Xi.” Include the code, destination email, expiration, and instructions to ignore an unsolicited request without subscribing that address.
- Welcome subject: “You’re connected with the Nu Chapter of Theta Xi.” Confirm the subscribed address and offer “Invite your brothers,” Manage preferences, and Unsubscribe. Add Read Nu News once the reader experience is ready.
- The template proposal uses a 15-minute verification code, replacing the earlier 24-hour verification-link recommendation. Attempt limits and resend rules remain to be designed.
- Declines, duplicate referrals, admin revocations, and unsubscribes use on-page feedback rather than additional automatic emails. A changed address receives the welcome only after verification/enrollment.

## Invite your brothers page: implementation plan

- Audience: an enrolled alumnus, arriving directly after joining or from the welcome email. Sending requires verification and enrollment; later visits need secure access rather than reuse of the original invitation as a permanent credential.
- Extend the existing chapter visual system with a calm, mobile-friendly single-column form, chapter identity, and no private admin sidebar.
- Heading: “Invite your brothers.” Explain that the chapter sends a personal invitation and recipients choose whether to join.
- Use repeatable recipient entries: required email, plus optional first name, last name, roll number, and graduation year. An “Add details” expansion can keep email-only entries compact. Add another recipient and remove-entry actions support multiple invitations.
- Preserve a bulk email-paste option accepting newline-, comma-, or semicolon-separated addresses. Convert pasted addresses into recipient entries so the inviter can optionally add details to any person before review.
- Show valid recipient count, remove duplicate entries within the pasted batch, and identify malformed addresses before sending. Preserve input on errors.
- Offer “Include my name in these invitations,” checked by default, with the actual profile name and a named/anonymous email preview. This is the implementation choice for the previously open default.
- Primary action: “Review invitations.” Review shows submitted addresses and any supplied profile defaults, sender, exact subject/body preview, attribution choice, and an explicit “Send invitations” button. Keep review inline on the same page with an Edit action.
- On acceptance, introduce editable defaults with “Check your details — your inviter filled in what they knew.” Do not expose existing profile data to the inviter when preparing these entries.
- Explain before sending: previously invited or opted-out addresses will not receive another invitation; each recipient receives an individual email without seeing other recipients.
- After processing, show a neutral confirmation and “Invite more brothers.” Do not reveal existing subscription, decline, replacement-address, or other private status, or claim every submitted address received mail.
- Handle empty input, malformed addresses, pending send, success, sending limits, invalid access, and partial/uncertain delivery without losing input or causing duplicate invitation sends. Never label accepted provider requests as confirmed delivery.
- Initial implementation limits: 20 addresses per batch and 50 new invitations per person in a rolling 24 hours. These are adjustable implementation choices based on the proposed limits.
- Do not add recipient membership lookup, a public directory, a referral leaderboard, or editable invitation copy to the initial page. These are scope recommendations, not separate user decisions.

## Recommendations proposed, not yet confirmed

- Let alumni subscribe without a login; link a subsequent verified sign-in to the existing person record rather than creating a duplicate.
- Require first and last names; make roll number and graduation year optional so forgotten information does not block enrollment.
- Preserve existing full names during migration rather than blindly splitting them. Do not merge profiles automatically based on self-reported roll numbers.
- Keep the inviter's identity internally even when omitted from the email.
- Use a chapter-controlled sender with a monitored reply-to address.
- Keep original invitation links valid until accepted, declined, or revoked. The approved email proposal uses a 15-minute replacement-email verification code; retry rules still need a specific design.
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
  Implementation uses the existing completed-issue reader policy: finalized issues with final PDFs, with matching database/storage restrictions. Public publication remains a separate existing workflow.
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
10. Approved the proposed invitation, verification-code, and welcome email templates.
11. Requested a plan for the “Invite your brothers” page; the proposed page above awaits review.
12. Required inviters to be able to supply any subset of collected profile fields, used as editable defaults when the recipient accepts. Revised the email-only entry proposal accordingly.
13. Requested implementation and a pull request. Implemented on a review branch; production migration, sender setup, and deployment remain separate.

## Implementation status

Implementation is ready for pull-request review: People → Alumni Connect, optional recipient details and review, personal invitation acceptance/decline, replacement-email codes, permanent alias deduplication, shared profile fields, code-based returning access, Nu News reading, and admin removal/revocation. See [alumni-connect.md](alumni-connect.md) for configuration, recovery behavior, and validation.

The implementation uses long-lived unused invitations, 15-minute codes, seven-day Connect sessions, admin-only revocation, and checked-by-default name attribution. These resolve earlier open implementation details without claiming that every recommendation above was separately approved.

The reviewed production migration has now been applied and the dedicated verified sender configured. Existing profile, reimbursement, contact and broadcast row counts were preserved; only the managed Connect list was added. No alumni invitation or subscriber records were created during validation. Deployment proceeds through the reviewed origin/main commit.

## Review resolutions and production authorization

- Reviewed the comments in `~/Downloads/a.txt`; see [alumni-connect-review.md](alumni-connect-review.md) for every finding, its validation, and the few deliberately rejected suggestions.
- Preserve privacy with aggregate sending totals rather than revealing individual subscription or decline status.
- Existing active mailing-list/Resend contacts suppress redundant invitations; an address-book contact alone does not establish consent.
- Verify the sender and API permissions before reserving a batch. Unknown sends remain permanently deduplicated; only definitively rejected, unsent invitations can be explicitly released by an admin.
- Empty managed lists are valid, including after the last subscriber leaves. Other mailing lists retain their existing minimum-size constraint.
- Self-service Connect profiles are capped at Nu News read, independent of ordinary Alumni reimbursement permissions. A People editor can explicitly verify membership to enable standard role permissions.
- Admin removals require confirmation and can be reversed without sending a new invitation. Rejoining mail always requires the recipient's explicit consent.
- Add searchable/paginated oversight, provider preference reconciliation, and possible-duplicate flags. Never merge people based solely on self-reported names or roll numbers.
- Production sender is `Nu Chapter of Theta Xi <connect@cal.taxi>` with a dedicated Resend key; the reply-to is the chapter's published `calthetaxi@gmail.com`. Hosting sender settings are preserved.
- The user authorized committing, pushing and deploying these fixes on main. No invitations to known alumni are sent by validation or deployment; admins review and send the initial batches themselves.

## UI simplification — November 10, 2026

- Replace raw, separated email lists with structured brother entries. Show email, first name, last name, roll number, and graduation year; only email is required. Add another brother creates another entry. This supersedes the earlier bulk-paste proposal.
- Show “You can send __ more invitations today” while preserving the rolling 24-hour server limit.
- Separate the admin page into Invite brothers, Invitations, and Alumni views. Keep search, records, provider checks, and status help within their relevant management view.
- Show the invitation preview during review, before the final Send invitations action. Preserve name attribution and all consent, verification, deduplication, and removal behavior.
- Place Alumni Connect after Roles in the Members tabs and keep all tabs usable on narrow screens.
- Validated desktop/mobile layouts, dark theme, structured multi-person payloads and review/send using local fixtures; no live invitations sent.

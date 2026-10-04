---
version: 1
slug: "app-admin-host-orders-id-page-tsx"
primary_target: "app/(admin)/host/orders/[id]/page.tsx"
related_targets:
  - "app/(admin)/host/orders/[id]/OrderTimeline.tsx"
  - "app/(admin)/host/orders/[id]/HostingFinancePanel.tsx"
---

Scope: /host/orders/[id] and order stages. Mode: Operate. Audience: hosting administrator. Task: understand event progress, send the next document, and record rental/permit payments. Approved direction: previews/order-flow/02-timeline.html. Existing signing requests and exact PDFs must survive.

## Direction contract
THESIS: The ordered event timeline explains what comes next and puts the relevant document action beside each milestone.
OWN-WORLD: Preserve the admin interface's Inter typography, white surfaces, fine gray rules, blue actions, and compact buttons. No lavish treatment.
STORY: Draft becomes Sent through email delivery; Documenso determines signatures; Berkeley dates determine Event held. Only rental and fire-permit finances need independent entry.
FIRST VIEWPORT: Organization and event date above the workflow; a vertical timeline dominates the left column, with a dedicated sticky preview pane on the right. Two finance actions occupy a compact row above both columns. Mobile keeps finances first and scrolls to the selected preview. Signer names, counts, and reminder controls are visible without entering an editor.
FORM: Timeline-first, the user's chosen second HTML prototype. Seed: user-approved-02-timeline (existing approved prototype; no new tournament).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: private per-person signing links; email preview before manually triggered sends; preserve existing live envelope and contracts; cancellation preserves history. Public-site DESIGN.md is outside scope; this extends the incumbent admin design.

## Implementation and design evidence

The implementation follows the approved second prototype: the event timeline leads, document actions sit beside milestones, and two independent finance trackers occupy a minimal row above the workflow. The dedicated right column holds email and PDF previews; on mobile, selecting a preview brings it into view. Signer names, counts, reminders, personal-link actions, and document previews are available from the order page without opening its editor.

The incumbent administrator system remains the visual source: `app/brand.css` supplies the Inter stack, brand blue, white surfaces, muted text, and fine gray rules. `OrderTimeline.tsx` and `HostingFinancePanel.tsx` reuse those semantic classes, shared `components/brand/button.tsx` controls, and existing field styles. No global token changes are required. Root `DESIGN.md` describes a separate public marketing surface and is preserved, as is `.impeccable/design.json`. The user's rejection of lavish styling remains a constraint on this surface.

Validated revised isolated-preview evidence: [desktop timeline](../review/desktop-revised.png), [mobile timeline](../review/mobile-revised.png), [desktop email preview](../review/desktop-revised-email.png), and [mobile email preview](../review/mobile-revised-email.png). The feedback fix is captured in [desktop feedback](../review/desktop-preview-feedback.png) and [mobile feedback](../review/mobile-preview-feedback.png). All six captures were viewed during the implementation session. These are captured sample UI screenshots, not generated shipping raster assets or evidence of live email delivery.

Email actions immediately render a local draft through the same pure template as delivery. Empty delivery IDs keep that draft unsendable until authorized background preparation returns the frozen recipient-specific body and exact attachment bytes. Eligible email/PDF requests run concurrently; page-memory caches coalesce requests and hold at most 32 email promises and 12 PDF entries. They use no persistent or shared browser storage, and PDF Blob URLs are revoked on eviction, unmount, and late completion after removal. The same-origin administrator preview route returns private `no-store` responses. Server preparation reuses saved outbox rows before attachment generation and bulk-inserts missing recipients; it does not synchronize signatures or send emails. Final delivery synchronizes signatures and rechecks current agreement, payments, cancellation, and recipients. Invitation prewarming is limited to unsent/new or previously incomplete invitations, preserving existing sent requests. The existing automatic completed-copy workflow remains separate.

Behavior and setup documentation: [Hosting event workflow](../../docs/host-event-workflow.md). Automatic stage computation, private individual emails, completed-copy delivery, cancellation, frozen attachment previews, finance history, additive migrations, and recovery boundaries are documented there. Existing envelopes and exact contract evidence remain in use. Confirmed forecast terms remain immutable after authorized agreement replacement; the finance panel makes current-term drift visible.

## Finish review status

The initial review requested robust payment failure handling. Record and reversal handlers catch failures, roll back optimistic state, clear busy state in `finally`, and retain controlled payment fields. The fresh finish review of the reduced finance row and preview-column layout requested moving action feedback from below the left timeline to the preview pane. One live announcement now appears directly beneath the Preview heading, and both feedback captures show the fix. The reviewer returned **ship at that fix scope**. Persistence, fidelity, and the restrained incumbent direction passed; the payment recovery finding is resolved. This verdict does not establish production recipient delivery or deployment. Domain verification and production environment configuration were completed in the implementation session, with no actual setup emails sent.

The implementation session recorded 28 passing targeted tests and a passing final production build after the feedback fix. Cold iframe fixture checks rendered the local email draft in 15.5 ms on desktop and 17.2 ms on mobile with a deliberately delayed 1,800 ms preview response. This is local draft rendering evidence, not a production server/PDF latency measurement. Final fixture checks reported no page errors and exactly one action-feedback announcement on each viewport. Desktop physical actions and payment retry were checked. Mobile preview switching used DOM events because headless iframe hit testing was unstable, so touch behavior is not established by those checks. The read-only preservation verifier passed the approved original PDF, existing envelope/revision identities, six personal-link hashes, and stored terms/documents before deployment. Deployment completion is not established here; verify the deployed Git ref/commit and rerun preservation after production rollout.

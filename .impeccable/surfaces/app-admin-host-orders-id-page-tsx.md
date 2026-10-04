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
FIRST VIEWPORT: Organization and event date above the workflow; a vertical timeline dominates the left column, with a narrow finance sidebar on desktop. Mobile stacks the finance section after the timeline. Signer names, counts, and reminder controls are visible without entering an editor.
FORM: Timeline-first, the user's chosen second HTML prototype. Seed: user-approved-02-timeline (existing approved prototype; no new tournament).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: private per-person signing links; email preview before manually triggered sends; preserve existing live envelope and contracts; cancellation preserves history. Public-site DESIGN.md is outside scope; this extends the incumbent admin design.

## Implementation and design evidence

The implementation follows the approved second prototype: the event timeline leads, document actions sit beside milestones, and two independent finance trackers occupy a narrow desktop sidebar. On mobile, finances follow the timeline. Signer names, counts, reminders, personal-link actions, and document previews are available from the order page without opening its editor.

The incumbent administrator system remains the visual source: `app/brand.css` supplies the Inter stack, brand blue, white surfaces, muted text, and fine gray rules. `OrderTimeline.tsx` and `HostingFinancePanel.tsx` reuse those semantic classes, shared `components/brand/button.tsx` controls, and existing field styles. No global token changes are required. Root `DESIGN.md` describes a separate public marketing surface and is preserved, as is `.impeccable/design.json`. The user's rejection of lavish styling remains a constraint on this surface.

Validated isolated-preview evidence: [desktop timeline](../review/desktop.png), [mobile timeline](../review/mobile.png), [desktop email preview](../review/desktop-email.png), and [mobile email preview](../review/mobile-email.png). These are captured UI screenshots, not generated shipping raster assets or evidence of live email delivery.

Behavior and setup documentation: [Hosting event workflow](../../docs/host-event-workflow.md). Automatic stage computation, private individual emails, completed-copy delivery, cancellation, frozen attachment previews, finance history, additive migrations, and recovery boundaries are documented there. Existing envelopes and exact contract evidence remain in use. Confirmed forecast terms remain immutable after authorized agreement replacement; the finance panel makes current-term drift visible.

## Finish review status

The initial review requested robust payment failure handling. Record and reversal handlers now catch failures, roll back optimistic state, clear busy state in `finally`, and retain controlled payment fields. Final reviewer disposition: **ship**. Persistence, fidelity, and the approved restrained direction passed; the payment recovery finding is resolved. Screenshot validation and implementation documentation are complete; they do not establish production recipient delivery. Domain verification and production environment configuration were completed in the implementation session, with no actual setup emails sent.

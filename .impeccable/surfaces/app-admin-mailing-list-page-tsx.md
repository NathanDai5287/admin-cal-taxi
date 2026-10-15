---
version: 1
slug: "app-admin-mailing-list-page-tsx"
primary_target: "app/(admin)/mailing-list/page.tsx"
related_targets:
  - "app/(admin)/mailing-list/broadcast-workspace.tsx"
  - "app/(public)/public-site/news/[id]/page.tsx"
---

Scope: named recipient lists, saved broadcasts, activity, and public finalized newsletter reader. Admin mode: Operate. Public mode: Read. Readers are chapter administrators, alumni, and friends. The user chose the October subject and supplied the exact body; the attachment sentence is adapted to the approved public link.

## Direction contract
THESIS: A familiar mailing workspace puts audience preparation, writing, and review in separate tabs while retaining the address book.
OWN-WORLD: Inherit existing private UI typography, field labels, fine rules, white surfaces, and blue buttons. The public reader inherits the public site's blue, square geometry, and Inter.
STORY: Save a named list; choose it in a draft; inspect the exact rendered message; publish a finalized issue; confirm sending; inspect activity on a locked record.
FIRST VIEWPORT: The editor pairs fields with a live email preview on desktop, stacks them on phones, and keeps sending after the review. Lists pair a generous paste field with saved audiences. The public page gives the issue title and download action, PDF, then accessible article text.
FORM: Existing-world extension; code-led operating flow. No concept seed or comp replaces incumbent interfaces.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: per-app read/write access and MCP grants apply; public routes expose only published final issues. Sending is explicit. Freeze content in database triggers. Never send mail during validation. Owner applies the migration separately.

## Finish evidence

Desktop and mobile screenshots in `.impeccable/review/` validate the actual broadcast, list, and public-reader components with local fixtures. They do not verify live database publication or delivery; the owner applies the migration separately. The finish verdict is pass / ship, limited to confirmation of the two reviewed fixes: permission-state controls are disabled and the public download action uses an SVG icon. This ordinary extension retains the incumbent private operating UI and public reading styles; no shared tokens or system changes were approved.

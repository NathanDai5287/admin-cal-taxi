# Portfolio demo

Public entry point: `https://admin.cal.taxi/demo` (also available at `https://cal.taxi/demo`). No account, demo credentials, or environment flag is required.

The demo is an isolated client workspace outside the authenticated `(admin)` route group. The proxy passes through only `/demo` and `/demo/…` before host rewrites and Supabase session refresh. Existing authentication and all live API/server-action authorization remain unchanged. The demo imports no server actions, database clients, email clients, or signing clients. Do not add live service calls to this route.

All sample records are hand-authored fiction in `lib/demo/model.ts`. Each visitor has their own localStorage snapshot under `cal-taxi-portfolio-demo-v1`; reset restores a fresh seed. Corrupt or incompatible snapshots fall back to the seed. If storage is unavailable, the UI explains that changes last only for the current page. No demo database or seed migration is needed.

## Working interactions

- Finance: search/filter, submit expenses, approve/deny/reopen, mark approved expenses paid, record dues payments, edit category budgets, cash summary, CSV export.
- Hosting: pricing using the production pure calculation, new drafts, notes, inquiry-to-completed workflow, sample PDF download.
- Members: search, add sample members, change demo roles; new members appear in dues and expense forms.
- Recruitment: add RSVPs and toggle check-in.
- Policy: clearly labeled scripted answers with expandable sample source excerpts; unsupported questions receive a bounded fallback.
- Accreditation: add/review evidence, generate/edit/download a local template draft from approved evidence.

Email delivery, payment transfer, signing, AI inference, receipt OCR, and real document uploads are not connected in the demo. The UI labels simulations where they occur. Booking PDFs are sample summaries, not live contract templates. Report draft edits are transient until downloaded.

## Verification

`node --test scripts/demo.test.mjs` covers data validity, isolation, state restoration, expense transitions, dues validation, financial totals, and CSV formula escaping. `npx tsc --noEmit` and `npm run build` check integration. Browser-check the public route while signed out, workflow transitions, downloads, persistence, reset, and narrow layouts before shipping.

## Surface direction

Operate mode for recruiters and hiring managers exploring the existing admin product. Inherit the admin brand: blue actions, neutral surfaces, compact tables, hairline rules, system/Inter typography, and existing light/dark theme. Persistent demo disclosure and navigation surround a working workspace. The overview offers expense review and hosting as clear starting points; activity and totals react to changes. All sample claims remain explicitly fictional. Keep production operations separate.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Stack and repository map

- One Next.js App Router app on Vercel, using Node.js, React, TypeScript, and
  Tailwind CSS with shared CSS. Supabase provides Postgres, Auth with Google
  sign-in, and file storage. See [package.json](package.json) for versions and
  commands, and [README.md](README.md) for setup.
- `app/` contains pages, nested layouts, and route-local server actions. HTTP
  endpoints use `route.ts` files, primarily under `app/api/`.
- `components/` holds shared UI and feature components. `lib/` holds domain
  logic, data access, and service integrations. `public/` holds static assets.
- `supabase/migrations/` holds database changes. `scripts/` holds tests and
  operational scripts, and `docs/` holds workflow documentation.

## App surfaces and layouts

- [proxy.ts](proxy.ts) maps hostnames to app surfaces. Check it before changing
  routes because the same URL can serve different pages on different hosts.
- `cal.taxi` serves the public chapter site from `app/(public)/public-site/`.
  Its layout owns the public header, footer, and stylesheet.
- `admin.cal.taxi` serves signed-in tools such as finance, hosting, rush, and
  user management from `app/(admin)/`. Its shared layout wraps the tools in
  `ProtectedShell`, and nested feature layouts supply navigation and access
  checks where needed.
- `reimbursements.cal.taxi` serves the member submission workflow from
  `app/submit/`. The `/demo` route lives in `app/demo/` and uses fictional,
  browser-local data. See [docs/demo.md](docs/demo.md) for its isolation rules.
- [app/layout.tsx](app/layout.tsx) defines the shared document shell, loads
  global styles, and initializes the theme. Start with the nearest nested
  layout when changing navigation or page framing for one surface.

## UI consistency

- Before editing UI, identify the closest existing screen for the same workflow
  on the same surface. For the public site, follow [DESIGN.md](DESIGN.md). For
  signed-in tools, use the reference screen and its shared components and
  styles. Shared theme tokens live in [app/brand.css](app/brand.css).
- Reuse the reference screen's page layout, spacing, typography, and patterns
  for actions, forms, tables, and status feedback. Search `components/` and the
  relevant route group before introducing a new component or style.
- Before wrapping up, compare the changed screen with the reference in a browser
  at desktop and narrow widths and in light and dark themes where supported.
  Exercise the changed workflow and relevant loading, empty, and error states.
  In the handoff, name the reference screen and report any checks you could
  not run.

## Local verification

- Start the app with `npm run dev`. Use `localhost:3000` for admin tools,
  `cal.localhost:3000` for the public site, and `reimbursements.localhost:3000`
  for member reimbursement submission.
- Use `npm run preview:host` to exercise the Host components with sample
  orders and simulated signing. See [the Host preview guide](docs/host-local-preview.md).
- Run the affected `test:*` scripts from [package.json](package.json) and
  `npm run lint` for code changes. Run `npm run build` for changes to routing,
  shared layouts, dependencies, or build configuration.

## Permissions

- When adding or moving a page or endpoint, check the matching prefix in
  [lib/route-access.ts](lib/route-access.ts) and the app's `none`, `read`, and
  `write` levels in [lib/app-access.ts](lib/app-access.ts).
- Enforce write access in server actions and route handlers. Reuse the access
  helpers in [lib/reimbursements/auth.ts](lib/reimbursements/auth.ts) for
  session-based access checks. Verify the changed workflow with read and write
  access, and check that View As blocks writes where applicable.

## Database changes

- Add schema changes in a new Supabase migration. Test against representative
  existing records and check affected access policies when permissions change.
- If app code depends on a migration, record the rollout order before pushing
  to `main`. Account for Vercel deploying while the migration is still pending.

## Git and production deployments

Work directly on `main` and commit and push completed changes to `origin/main`.
Do not create or deploy a feature branch unless the user explicitly requests it.
Use commits from `origin/main` for Vercel production deployments. Checking the
deployed Git ref and commit is optional. If Vercel is unavailable or a deployment
fails, report the push and deployment status separately.
Preserve existing live orders, approved contract PDFs, signing envelopes, and
personal signing links when changing the hosting workflow.

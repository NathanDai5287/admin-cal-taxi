<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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

## Git and production deployments

Work directly on `main` and commit and push completed changes to `origin/main`.
Do not create or deploy a feature branch unless the user explicitly requests it.
Use commits from `origin/main` for Vercel production deployments. Checking the
deployed Git ref and commit is optional. If Vercel is unavailable or a deployment
fails, report the push and deployment status separately.
Preserve existing live orders, approved contract PDFs, signing envelopes, and
personal signing links when changing the hosting workflow.

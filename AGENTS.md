<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git and production deployments

Work directly on `main` and commit and push completed changes to `origin/main`.
Do not create or deploy a feature branch unless the user explicitly requests it.
Vercel's production branch is `main`; production deployments must use a commit
on `origin/main`. Verify the deployed Git ref and commit before reporting success.
Preserve existing live orders, approved contract PDFs, signing envelopes, and
personal signing links when changing the hosting workflow.

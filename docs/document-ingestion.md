# Resumable document ingestion

The new pipeline is gated by `DOCUMENT_INGESTION_ENABLED=true`. Production is
disabled until its worker secret and recurring schedule are configured.

## Local testing

The additive database migration `20261113000000_document_ingestion_jobs.sql`
must be applied to the database configured in `.env.local`.

Set `DOCUMENT_INGESTION_ENABLED=true` and a random `DOCUMENT_INGESTION_SECRET`
in `.env.local`. Restart the dev server after changing environment variables.

Run `npm run dev`, and in another terminal run `npm run ingestion:worker`.
The worker invokes localhost every minute. Use `npm run ingestion:worker -- --once`
for one bounded execution. Set `INGESTION_WORKER_URL` if using a port other than 3000.
Upload through the policy/evidence library or select Reprocess on an existing
document. Processing continues with the worker terminal open even when the browser
is closed. Stopping the worker preserves committed progress.

**Localhost uses the database and storage named in `.env.local`.** This may be
the shared live database. Use disposable fixture documents for deletion/fault tests.

Existing legacy chunks are imported as a frozen complete extraction; matching
embedding checkpoints are reused. PDFs without saved chunks start native-text
extraction page by page, using Gemini only for uncertain/image-containing pages.
Partial output is kept in private staging tables until atomic activation.

Library status shows the saved stage and counts. Reprocess resumes a paused job.
Initial status is server-loaded. Rows and the upload queue share batched status
checks (up to 20 IDs per request), only for active jobs, at 15-second intervals.
Waiting jobs sleep until their retry time. Idle and terminal documents have no
recurring status requests; hidden/offline tabs pause monitoring. Use Refresh
processing status to discover jobs started in another tab. These checks do not
make Gemini calls.
Processing options can cancel a job or retry a native-text page with Gemini in a
new generation. Approved report source text and published policy are protected.

## Production activation (not enabled by this change)

1. Set a random `DOCUMENT_INGESTION_SECRET` in Vercel's production environment.
2. Store the same value in Supabase Vault as `document_ingestion_secret`.
3. Set `DOCUMENT_INGESTION_ENABLED=true` in Vercel and redeploy from `origin/main`.
4. Execute `scripts/configure-ingestion-cron.sql` against the linked database.
5. Check the cron HTTP response and job progress with no browser or local worker
   running. Verify the deployed ref and SHA before declaring rollout complete.

The worker endpoint checks its secret and bypasses user-session middleware.
The scheduler uses the stable `admin.cal.taxi` domain, not a preview deployment.
Do not schedule the local worker against production at the same time for testing.

## Recovery and limits

Per-page and per-chunk commits are idempotent. A provider call whose result was
lost before saving may repeat; already committed work is reused. Five-minute
leases fence late workers, and foreign keys/archive cancellation prevent deleted
sources from being recreated. Rate limits create model-wide cooldowns; eight
consecutive transient failures pause the job for manual resumption. Daily/billing
quota errors pause immediately. Initial pacing is 10s OCR and 2s embeddings;
it cannot guarantee a particular provider quota will never be exceeded.

Run `npm run test:accreditation` for database checkpoint and PDF extraction tests.
Logs use `document_ingestion` and `document_ingestion_failed`, without source text.

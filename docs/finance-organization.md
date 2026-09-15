# Finance organization

## Page ownership

| Area | Owns writes to | UI reused |
| --- | --- | --- |
| Accounts → Receivable | Dues assignments, balances, collections, reminders | Dues ledger, bulk fee form, announcement form |
| Accounts → Payable | Payment state on approved reimbursements | Existing payment table and confirmation dialog |
| Accounts → Activity | Direct expenses, optional receipt images, actual income, opening cash | Former Reports expense form and former Budgets funding form |
| Planning | Income forecasts and category allocations | Budget forms |
| Review | Reimbursement decisions, category and merchant corrections | Submission table, detail page, receipt viewer |
| Reports | No financial writes | Spending breakdowns and PDF/CSV/JSON exports |
| Members (shared app) | Registration, invitations and access | Existing member management |

The Finance home redirects to Accounts. Old dues and reimbursement URLs redirect to their new pages. Submission and authentication URLs remain compatible.

All activity belongs to the current term for now. There is no term selector or editable term calendar. Date filters on Reports are ordinary report filters; full financial exports include all current activity rather than silently filtering against the old term settings.

## Data and rollout

Apply `supabase/migrations/20260914000000_finance_boundaries.sql` before deploying this code. This migration has been tested in an isolated PostgreSQL cluster, not applied to a live database by this change.

- Existing funding rows remain actual income (`kind = income`), consistent with how the financial PDF previously used them. New Planning entries are forecasts and do not affect actual income. Existing category limits remain intact; forecasts start empty.
- New dues require an active member/admin account ID. Existing name-only balances retain their amounts and names, and the ledger marks them as needing an account link. Admins explicitly choose the account in Edit; migration never guesses from a name. Pending invitations and uninvited accounts are ineligible.
- Payment batching groups by account ID. Unlinked historical reimbursements remain separate, preventing people with the same name from being combined.
- Manual expenses retain the existing admin-only row-level security. Their new nullable receipt path references a private image. The admin server action accepts JPG/PNG files up to 3 MB, checks the image signature, and cleans up uploads if the transaction insert fails. Images are viewed using temporary signed URLs.
- Database triggers enforce approval/payment rules for both website and Discord writes. Paying an unapproved request is rejected. Changing a paid request's decision requires first correcting its payment. Approval waits for receipt processing to finish.

## Deliberately retained in this separation pass

The existing aggregate dues payment amounts and reimbursement paid flags are retained. This pass does not introduce a dated payment/reversal ledger, automatic posting of dues collections to income, or bank reconciliation. Actual income exports still use recorded income entries; a dues balance payment updates receivables. Existing manually recorded dues income must be reconciled before a future automatic-posting migration to avoid double counting.

Discord contact fields still live on dues balances. Member submission/history still uses the existing member site. Moving contact fields to profiles, adding member dues visibility, richer review reasons and separate scanner/decision statuses are follow-up work.

## Future whole-site snapshots and restore

This is a separate feature, not implemented by the financial PDF/CSV/JSON exports.

The intended feature is an admin-only, versioned snapshot file that can be downloaded, stored with snapshot metadata in the database, and restored. Inventory all website state first: Finance tables, profiles/invites and authentication references, private receipts, Host data/documents and its backend, and Rush data in its separate Redis service. A database-only finance export is not a whole-site snapshot.

Restore should validate the schema version and referenced files, show the concrete changes, create a pre-restore snapshot, and restore records and files together. Decide whether file bytes live in the snapshot file or in storage referenced by the database snapshot record. Restore must suppress external side effects such as Discord messages and invitation emails; never serialize service credentials or live sessions. Term management can be designed with this feature later.

## Verification

- `npm run lint`
- `npm run build` (local placeholder Rush Redis configuration may need to be cleared for the build: `RUSH_KV_REST_API_URL= RUSH_KV_REST_API_TOKEN= npm run build`)
- `bash scripts/finance-boundaries.test.sh` (requires PostgreSQL binaries; creates and removes its own isolated cluster)

The database checks cover registered-member enforcement, duplicate names, preserved legacy balances, settlement after archival, approval/payment transitions, forecast isolation from income, and admin-only manual spending with and without receipts.

# Host document ownership

## Administrator behavior

Create retains one unfinished event per browser tab. Opening an order reads only that order. Update Order starts an explicit draft owned by that order; Duplicate starts a new draft without previous representatives, document IDs, or an update target. A successful final save or signing approval retires only its own draft.

The order pricing snapshot shows the agreed rental fee and refundable deposit. Invoice itemization scales the historical calculator components to the agreed fee. The original calculator estimate is labeled separately. Missing historical pricing uses a generic rental line with the agreed amount rather than inventing historical charges.

## Boundaries

- `host-state-model.ts` is the pure, whitelisted state model and archive normalizer. Unknown snapshot fields cannot enter a draft.
- `HostWorkspaceBoundary` mounts the draft provider only on Create steps. Order pages have no draft provider and cannot read or write Create context.
- `host-draft-storage.ts` stores UUID-owned drafts in separate localStorage keys. The active pointer is sessionStorage-local. A browser Web Lock leases each writable draft; duplicated tabs fork when its lease is already held. Browsers without Web Locks use a separate copy on mount.
- A draft UUID is stable through normal navigation and reload. Changing the active owner remounts all forms and PDF state. Late generation and save responses are checked against the active owner and approved inputs.
- Generated entries are invalidated when event terms or invoice fields change. Only entries matching current approved inputs can be saved.
- New archived document entries include their approved source snapshot and a server-signed generation receipt. The receipt binds kind, exact generation payload, source owner/inputs, and returned PDF filename. Credentials remain on the backend. Receipts are carried in the authenticated PDF proxy response and never logged.
- The archive validates parties, dates, contract options/representatives, snapshot pricing, monetary metadata, and document source ownership. A unique SQLite index prevents two orders owning one document context. Existing owners cannot be removed or replaced.
- Term updates and document attachments compare the reviewed order version under a write transaction. Stale tabs must reload; they cannot silently replace newer inputs or PDFs. An older migrated explicit draft without a reviewed version may require reloading its order before updating; the draft is retained on failure.

## Historical records and signing

Unscoped legacy document entries remain stored and included in the existing ledger and status calculations. They are marked stale because their unique provenance cannot be verified. Current unsigned PDFs are generated from the order snapshot and agreed amounts, never those unverified payloads. This also addresses the reported six-club order with older, different-club document payloads. No payments, financial confirmation, signing invitations, or historical signing files are modified by this repair.

Verified financial documents compare only their relevant identity/pricing/guest inputs when displayed. Updating a representative's name/email or the chapter presign option does not invalidate an issued invoice. Contracts compare all approved terms. Signing distribution additionally validates the saved contract options and named representatives.

Signing downloads keep using exact revision originals/completed files, with no template regeneration. Revision history and private links remain associated with their order. Theta Xi generator presigning is preserved.

## Migration and deployment

Backend startup adds nullable `documents.source_snapshot` and the unique nonempty snapshot `documentContextId` index. Migration is idempotent. Before deployment, check live snapshot JSON validity and duplicate contexts, take a SQLite backup, then update/restart the API. Deploy the admin app with the same backend version because new attachments require receipts and reviewed versions.

Legacy browser draft migration writes the new scoped draft before deleting the singleton. Explicit edit/preview attachments and old manual pricing overrides are retained; ambiguous attachments are detached. Stored private signer data is never included in screenshots or logs.

## Verification

- Node tests execute real state/storage/snapshot modules: independent identical-event drafts, whitelisting, safe retirement, legacy attachments/manual pricing, quota failure, incomplete historical pricing.
- Chromium tests exercise actual Create/order components with controlled server actions/PDF responses: reload, duplicated-tab leasing, A/B order navigation, late retired-draft responses, term changes during PDF generation, final-save retirement, four parallel downloads, exact signing file selection/failure guards, refund dependencies, phone overflow.
- Backend tests use temporary databases and controlled addresses: identical-party/date orders, receipt tampering, missing/null amount, owner uniqueness/removal, stale updates/attachments, signer-only financial preservation, generation receipt round trip, ambiguous party lists, malformed legacy metadata, formatted signing money and foreign representatives.
- Independent reviews cover administrator UI/state, archive/generator invariants, and signing/financial behavior.

Ordinary unsigned invoices still regenerate from approved archived inputs and the current template; completed signing files remain exact stored bytes. The isolation refactor does not claim to make arbitrary future software bugs impossible: ownership boundaries and server invariants specifically prevent the shared-workspace and cross-order attachment paths found here.

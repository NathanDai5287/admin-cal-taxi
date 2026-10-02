# Local Host flow preview

This preview runs independently of the deployed application. It cannot alter a real order or signing request.

Run `npm run preview:host`, then open:

- http://localhost:4176/host/orders/ord_local_five_people
- http://localhost:4176/host

The first link shows a **sample** five-person pending request. Select **Load example draft** to try the Create flow. **Simulate one signature** advances only sample progress; **Reset sample orders** restores it. Changes to sample orders persist in this browser on this port.

The preview renders the actual Host components in a standalone browser bundle. At build time, server actions are replaced with local sample-data actions. The bundle rejects production-only authentication, backend, and Supabase dependencies. The HTTP server binds only to `127.0.0.1`; browser fetches and its content security policy restrict requests to this server. The runner does not load `.env` files.

Signing links, payments and PDF responses are **simulated**. The sample PDF is explicitly illustrative, with five signature pages. It is not the approved generator output. Do not use this preview to obtain a real contract or signing link. Production authentication is not bypassed or changed.

Stop with Ctrl+C. Set `HOST_PREVIEW_PORT` to select another local port.

## Implemented flow

1. Event & people: each organization's representatives are entered together. Row membership survives renaming, blank intermediate edits, reloads, and removing another organization.
2. Pricing: existing calculator and agreed-price behavior are preserved.
3. Contract terms: chapter auto-sign remains the existing generator signature. When disabled, enter the chapter representative's name and email.
4. Review & signing: review agreement totals, deadlines, named representatives and the PDF, then create links. A separate save action saves a draft or changes; downloading PDFs does not approve the agreement.
5. Saved order: independent signature, recorded payment and budget summaries; current contract and signer progress first; billing PDFs and copyable payment message below; older revisions collapsed.

Copying a signing link never marks it sent. Delivery is acknowledged separately. No financial confirmation or payment action runs as part of signing.

## Companion backend changes

Local source is in `../theta-xi-rental-signing-work`. The frontend and backend activation protocol are released together; deploy the additive backend update before the frontend. No Documenso upgrade is needed.

`store.init_db()` adds one nullable `signing_revisions.approved_order_patch` column. Existing requests, links, signatures and PDFs are retained. No new credentials are required.

Preview preparation stores an immutable draft PDF without editing an existing order or cancelling an envelope. Activating replacement links requires explicit confirmation and the reviewed order version. The backend persists approval in an `activating` state, verifies cancellation before replacing old links, waits for signatures already sealing, then applies the approved terms. Interrupted activation resumes the same approval. Ordinary order updates cannot bypass contract protection by creating an inert preview.

The local regression suite covers cancellation that falsely reports success, interrupted provider access and retry, concurrent independent notes, old links remaining active during preview, completion during replacement, migration preservation, and unchanged invoice/order operations. Browser checks use controlled sample addresses only. The original local implementation did not contact live requests. Release checks inspect provider identity, personal link page availability, and original PDF hashes without submitting signatures or cancelling requests. SQLite and exact PDFs are backed up before release.

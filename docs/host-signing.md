# Hosting contract signing

The `/host` documents and order pages integrate with self-hosted Documenso Community Edition v2.19.0 and the companion Flask/Typst generator. A controlled live test deployment was installed on Minmus on Sep 30, 2026. Its SMTP sink does not relay mail; use controlled addresses until production email, backups, and capacity are approved.

## Administrator workflow

1. Enter event and contract terms in the existing host steps. On Documents, enter each club representative's full name, email and club. Every club needs one or more representatives. Keep **Auto-sign Theta Xi** checked to use the generator's existing chapter signature, or leave it unchecked and enter the chapter representative's name and email.
2. Select **Preview contract for signing**. The app saves the order automatically with an idempotent order creation key, renders a revision, stores its exact PDF, and shows it in the page. Each signer has a dedicated printed execution page. The generator reads actual PDF box positions after rendering, so page count and wrapped names do not depend on sample PDF coordinates.
3. Select **Create signing links** only after reviewing the PDF. The server sends the stored bytes to one Documenso envelope, sets distribution to `NONE`, signing order to `PARALLEL`, and assigns a required signature, name and date field to each recipient. It returns a private URL per person. The UI has **Copy signing link**, **Mark sent**, and **Copy completed-copy link** actions. Copying does not mark a link sent; **Mark sent** records the administrator's acknowledgement and can be undone.
4. The Documents page and order detail use the same signer preparation and progress section. They show each person's link delivery acknowledgement and signing status, plus `N of M signed`. Refresh checks Documenso's current state. Once all recipients sign, the app downloads and stores the exact signed PDF and audit PDF before showing **Signed**. The order page offers those files and the original; existing unsigned archives are not described as signed.

## Recipient workflow

The administrator sends the personal Documenso URL through a chosen channel. A recipient opens it without an account, reviews the entire document, confirms their name, types or draws a signature, fills their assigned name/signature fields, sees the date auto-filled, and deliberately confirms signing. Their link is scoped to their own fields. A separate completed-copy URL supplied by the administrator works once the last person signs and the completed file is stored. That URL's secret is in a URL fragment, which browsers do not send in HTTP request paths; the page posts it to a no-store endpoint to retrieve the stored PDF.

`NONE` distribution suppresses recipient invitation and completed-copy emails in v2.19.0. The controlled test received an owner completion notification. Documenso's recipient confirmation screen says an email copy will arrive, but no recipient completion email arrived in the controlled test. Send the completed-copy link yourself. Signing and completed-copy URLs are private access credentials.

## Server settings

| Service | Variable | Purpose |
| --- | --- | --- |
| Next admin app | `HOST_BACKEND_ORIGIN`, `HOST_BACKEND_KEY` | Existing authenticated archive/PDF connection. |
| Next admin app | `DOCUMENSO_WEBHOOK_SECRET` | Secret set on the Documenso webhook; validated with `X-Documenso-Secret` in constant time. |
| Flask backend | `DOCUMENSO_ORIGIN` | `https://sign.cal.taxi` in production. |
| Flask backend | `DOCUMENSO_API_KEY` | Server-only team API token for envelope operations. |
| Flask backend | `SIGNING_STORAGE_DIR` | Durable directory for exact original, completed and audit PDFs. |

Configure a Documenso webhook pointing to `https://admin.cal.taxi/api/host/signing/webhook` for document signed/completed/cancelled events. Notifications only trigger a backend refresh: the backend confirms the envelope ID, external revision ID and recipient list by fetching from Documenso. Duplicate or delayed notifications cannot mark a different order signed. The page also refreshes on load, so a missed webhook is recoverable. Never put the API token, webhook secret, recipient URLs or completed-copy tokens in public environment variables or logs.

Documenso installation, certificate, DNS/tunnel, email, storage and backup instructions are in `deploy/documenso/README.md` of the companion generator repository. Minmus runs Flask on loopback port 5000, Documenso on loopback port 3005, and a dedicated Cloudflare tunnel for `sign.cal.taxi`.

## Revisions and finances

Each prepared contract has an immutable original PDF and a revision number. A changed payload creates a new revision; a pending previous envelope is cancelled before the new revision is available. The prior PDF and record remain. The backend rejects ordinary order term updates while a revision is pending or signed, requiring a new preview first. A failed/unknown create response is never retried blindly; **Check and resume request** searches the provider by the exact external revision ID. If no matching provider record appears after 15 minutes, it records a failed revision and permits a new one.

Signing does not invoke the financial confirmation action, change payment fields, or set a paid state. The `Contracted` order status from older workflows still means only that a contract document was generated.

## Tested and pending

The Python suite tests field ownership, multiple club signers, chapter presigning on/off, immutable PDF upload, retries, partial/final status, duplicate sync, cancellation, and unchanged order finance fields. A controlled local Documenso v2.19.0 run exercised the actual create/distribute API, all three signers in parallel, account-free desktop and phone signing, typed and drawn signatures, automatic date field, final confirmation, signed/audit downloads, no recipient emails, completed-copy retrieval through the Next route, and cancellation rejection of old field submissions. The original downloaded from Documenso matched the preview's SHA-256 exactly.

The live `sign.cal.taxi` site and Documenso API have passed health/authentication checks; an end-to-end contract on that live instance and webhook delivery still need a controlled-address test. The live SMTP sink deliberately retains all mail locally, so no real recipient email will be delivered. Set up production SMTP, encrypted off-host backups, and additional disk capacity before sending real signing links. The self-signed PDF certificate may show an untrusted certificate warning in PDF readers; this integration makes no universal trust or legal compliance claim.

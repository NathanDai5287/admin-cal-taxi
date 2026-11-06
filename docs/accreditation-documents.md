# Example-based accreditation documents

Open **Accreditation → Document types**. Upload up to 30 PDF, DOCX, or XLSX
examples (25 MB each). A main-library upload creates one type per file. Within
a type, additional uploads become examples of that same document.

Names start with the filename. Rename them in the upload batch or type settings;
AI naming suggestions are optional. Choose ready examples and an academic period,
then start a draft. Describe the desired changes, edit the resulting text/tables,
and generate a PDF. Edits save after a short pause; **Save edits** saves immediately.
Approval archives the reviewed PDF separately. Older PDFs remain downloadable.

Use **Delete saved form** on a dashboard card, document type, or legacy template
to remove it from the reusable library. Its uploaded examples and templates are
retained for existing submissions. Those submissions remain accessible under
**Submissions from deleted forms** on the dashboard for their academic year.

## Processing and quotas

Files upload directly to private Supabase storage using short-lived signed upload
URLs. Metadata is saved before upload. Reading runs sequentially while the page is
open. Each PDF page is checkpointed; analysis follows reading. Reopen the library
and choose **Resume processing** after an interruption. An interrupted file upload
requires selecting the original file again. Already stored bytes are reused.

The database lease serializes AI work across tabs. Capacity errors pause work and
respect a cooldown. There is no unattended background worker. Generation uses the
configured language model once per turn, without embedding or search requests.
PDF rendering and manual editing do not call AI. Successful extraction is reused
for identical file contents. A saved draft version prevents late responses from
overwriting newer changes. Request IDs make retries idempotent.

`ACCREDITATION_DOCUMENT_CONTEXT_CHARS` defaults to 160000 and
`ACCREDITATION_DOCUMENT_OUTPUT_TOKENS` to 16384. Oversized context is rejected
without silently omitting examples. The new workflow uses the existing Gemini
language/OCR model settings; it does not automatically switch models on quota
errors. Logs contain operation/model/timing and available token counts, not content.

## Storage and compatibility

The additive `20261105000000` migration introduces private example batches,
examples, request records, a global AI lease, and structured document payloads on
existing working states and revisions. New entry points enforce accreditation app
permissions; writes use service-only database functions. Original templates and
legacy submissions continue to work at `/accreditation/templates`.

Structured documents contain headings, paragraphs, lists, tables, signature lines,
and page breaks. Typst receives JSON as data, never generated source code. Tables
can designate numeric columns for application-calculated totals. Unknown amounts
must be supplied before enabling a total. Template text is untrusted reference
material; historical examples do not establish current facts.

Run `npm run test:accreditation` and `npm run build`. The document tests cover
structured generation, limits, table arithmetic, real PDF compilation, 30-item
batch naming, request retries, stale edits, approval guards, and database access.

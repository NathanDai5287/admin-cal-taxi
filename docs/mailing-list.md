# Mailing List

People with Mailing List access can open **Mailing List** on the admin home page or go to `/mailing-list`.
The workspace has **Broadcast email**, **Mailing lists**, and **Address book** tabs.
Read access allows viewing and activity reporting; write access is required for changes and sending.
Contacts are shared, persistent records separate from member accounts and invitations.
Adding a contact does not create an account or send a message.

## Named mailing lists

Open **Mailing lists**, give the list a name, and paste email addresses separated by
newlines, commas, or semicolons. Display names such as `Alex <alex@example.com>` work.
Choose **Preview recipients** to check the unique count and duplicates. Correct invalid
entries before **Save mailing list**. Up to 10,000 recipients and 2 MB are accepted.
**Use all address book emails** includes every page of the existing address book.
Saved lists can be reopened and edited; preparation freezes a separate recipient segment
for each broadcast, so later list edits do not alter a prepared email.

## Broadcast emails

The October 2026 draft starts with the user-approved subject and message. Its attachment
sentence points to the approved public newsletter link. Choose a saved mailing list,
edit the subject/body, add the reply-to email and chapter mailing address, then save.
The body is plain text with preserved whitespace and clickable web addresses; raw HTML
is escaped. A side-by-side preview includes the newsletter button and unsubscribe footer.

Choose a finalized Nu News issue to include its public reading link. A draft issue cannot
be published. **Prepare broadcast** checks the sender and tracking configuration, freezes
the message, and starts a bulk contact import into a dedicated Resend segment. Choose
**Check preparation** until ready. Existing unsubscribe status is never explicitly reset.
Preparation also publishes the chosen finalized issue. It does not send the email.
Preparing a newsletter requires both Mailing List and Nu News write access.

Review the exact message and recipient count, check the consent/confirmation box, then
send. Resend skips unsubscribed contacts, so the selected list count is an upper bound.
The application records provider acceptance, not guaranteed inbox delivery. A database
claim prevents concurrent sends. Ambiguous failures stay in review and must be checked
in Resend; **Check sending status** reconciles queued/sent results without sending again.

Sent broadcasts receive a finalization timestamp. Database triggers refuse changes or
deletion, including with the service role. Prepared message content is also immutable.
The existing Nu News finalization and storage guards protect the published issue, PDF,
and source photos. A correction requires a new issue and a new broadcast.

## Public newsletter and activity

Published issues are readable at `https://cal.taxi/news/<issue-id>`. The page offers the
PDF reader, a download link, and accessible article text. The permanent link generates
fresh storage links when needed; it never exposes draft PDFs or the private storage bucket.
Only issues explicitly published through preparation or MCP are visible publicly.

After sending, **Load activity** reports email opens and clicks by recipient through
Resend's Broadcast Recipients API, plus campaign-attributed newsletter visits, PDF link
opens, and download clicks. Recipient results and database events are paginated.
Email metrics follow Resend's retention policy; the Free plan currently retains data
for 30 days. Application-owned newsletter events remain in the database.

Newsletter visits use a random, first-party, HttpOnly browser cookie for unique browser
counts; no IP addresses or email addresses are stored in newsletter events. The broadcast
ID passes from the email button through the public reader's PDF links. Automatic embedded
PDF loads and HEAD requests do not count as PDF clicks. Shared links remain attributed to
their original campaign. Opens can be blocked or preloaded; link scanners can inflate
counts. A downloaded PDF cannot report subsequent offline opens or reading completion.

## MCP tools

The existing `/api/mcp` endpoint exposes `list_mailing_lists`, `get_mailing_list`,
`save_mailing_list`, `list_broadcasts`, `get_broadcast`, `save_broadcast`,
`prepare_broadcast`, `send_broadcast`, `refresh_broadcast_status`,
`get_broadcast_analytics`, and `publish_nu_news_link`.
Tools check current OAuth app access and record secret-free audit entries before data access.
Create calls use caller-chosen UUIDs; edits and sends require the current `updated_at`
revision. Sending requires literal `confirm: true` after the user approves the exact
saved message and recipients. Publishing requires Nu News write access and confirmation.
`get_broadcast` returns the saved message and rendered HTML for review.

## Resend configuration

Set `RESEND_BROADCAST_API_KEY` to a **full-access** Resend key; a send-only key cannot
manage contacts, segments, broadcasts, or analytics. The code falls back to
`RESEND_API_KEY` if a separate key is absent. Set `RESEND_BROADCAST_FROM_EMAIL` to a
verified sender (fallback: `RESEND_FROM_EMAIL`). Enable open and click tracking for that
sender's domain in Resend. Preparation checks all three requirements before importing.
Broadcasts use Resend's marketing allowance, separate from the transactional daily cap.

Use **Add a person** for quick entry. First name and either email or phone are required;
last name is optional. Phone is optional when an email address is provided, including
in imports with no phone column. Successful saves clear the form for the next person. Use **Edit**
to change details, or **Remove** and confirm the specific contact to delete it.
Search by name, email, or phone. The list displays 50 contacts per page.

## Export email addresses

Select **Export all emails**, then **Copy all emails**. The export includes unique,
nonempty email addresses from the entire mailing list, regardless of the current search
or page. Addresses are separated by commas for pasting into Gmail's **To**, **Cc**, or
**Bcc** field. Contacts without email are skipped. If automatic clipboard access is
unavailable, select the output and use your browser's Copy command.

## Bulk import

1. Select **Import contacts** and choose a CSV, TSV, or delimited `.txt` file, or paste
   rows copied from Excel or Google Sheets. Commas, tabs, and semicolons are supported.
2. Leave **First row contains column names** checked if the source has headers.
3. Select **Preview import** and check the column matches. Common headers such as
   `Fname`, `Lname`, `First Name`, `Email Address`, and `Mobile` are recognized.
   For other headers, select the matching column for each field.
4. Review the sample and invalid row messages, then select **Import … valid contacts**.
   Invalid rows are skipped and counted. Correct the source and preview again to include them.

The import accepts up to 10,000 contacts and 2 MB at once. A downloadable CSV template
is included. Quoted commas, escaped quotes, and line breaks inside quoted fields are supported.

Duplicate identities use the lowercase email address, or digits of the phone number when
email is absent. Formatting differences such as `(510) 555-0123` and `510-555-0123` match;
country codes must be consistent. People with different email addresses may share a phone.
Existing records are never overwritten by import. Use **Edit** for updates. Each import
is one transaction, and retrying it skips contacts that were already saved.

## Deployment and validation

Apply `supabase/migrations/20261014130000_mailing_list.sql` before deploying the page.
Apply `supabase/migrations/20261014160000_mailing_broadcasts.sql` after the existing
Nu News and role-app-access migrations. The broadcast migration adds mailing lists,
broadcasts, public publication records, newsletter activity, and immutability guards,
and seeds the approved October draft. It sends no mail and publishes no issue.
When the new tables are absent, the page shows a setup notice and preserves address book access.
The database owner can run that exact file in the SQL Editor. Review migration history
before using a general `supabase db push`, since unrelated older migrations may be pending.
The new table has row level security allowing administrators only. Every page load and
server action also checks the administrator role. The bulk insert function is restricted
to the service role and receives validated records from the authenticated server action.

Run `npm run test:mailing-list`, `npm run test:broadcasts`, `npm run test:mcp`, lint, and `npm run build`.

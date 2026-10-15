# Mailing List

Administrators can open **Mailing List** on the admin home page or go to `/mailing-list`.
Contacts are shared, persistent records separate from member accounts and invitations.
Adding a contact does not create an account or send a message.

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
The new table has row level security allowing administrators only. Every page load and
server action also checks the administrator role. The bulk insert function is restricted
to the service role and receives validated records from the authenticated server action.

Run `npm run test:mailing-list`, `npm run lint`, and `npm run build`.

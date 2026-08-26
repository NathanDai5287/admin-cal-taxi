# admin-cal-taxi

Internal Next.js tools for cal.taxi, including rush administration, hosting documents,
and receipt reimbursements.

## Receipt reimbursements

The reimbursement app is mounted at `/reimbursements` and uses Supabase for invited-user
authentication, PostgreSQL data, and private receipt storage. Tabscanner performs receipt
total extraction in the background.

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Apply `supabase/migrations/20260826000000_receipt_reimbursements.sql` to the Supabase project.
3. In Supabase Auth, disable public signups and allow these redirect URLs:
   - `http://localhost:3000/reimbursements/auth/callback`
   - `https://admin.cal.taxi/reimbursements/auth/callback`
4. Create the first user in Supabase Auth, then promote that account in SQL:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'treasurer@example.org');
   ```

Use Node.js 22 or newer. Run locally with `npm install` and `npm run dev`. Verify
changes with `npm run lint` and `npm run build`.

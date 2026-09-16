import { Button } from "@/components/brand/button";
import type { Metadata } from "next";

import { inviteUser } from "@/app/(admin)/users/actions";
import { MembersTable } from "@/app/(admin)/users/members-table";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function UsersPage() {
  const [session, supabase] = await Promise.all([getSessionProfile(), createClient()]);
  const profilesResult = await loadAllPages((from, to) => supabase
    .from("profiles")
    .select("id, full_name, email, role, has_signed_in, created_at")
    .is("removed_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));

  if (profilesResult.error) {
    throw new Error(`Unable to load members: ${profilesResult.error.message}`);
  }
  const profiles = profilesResult.data ?? [];

  return (
    <div className="grid gap-6">
      <div>
        <p className="page-eyebrow">Chapter admin</p>
        <h1 className="page-title">Members</h1>
        <p className="page-lede">Invite people and manage who can access the chapter apps.</p>
      </div>

      <section className="card" aria-labelledby="invite-user-title">
        <div className="card-header">
          <span className="card-title" id="invite-user-title">Invite people</span>
        </div>
        <form action={inviteUser} className="card-body border-t border-rule pt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto] items-end">
          <div className="field">
            <label className="field-label" htmlFor="email">Email addresses</label>
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="field-input"
              id="email"
              multiple
              name="email"
              placeholder="alex@example.com, jordan@example.com"
              required
              spellCheck={false}
              type="email"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="role">Role</label>
            <select className="field-input" defaultValue="member" id="role" name="role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button variant="primary" type="submit">Invite</Button>
        </form>
        <p className="helper-text px-6 pb-5">
          Separate multiple email addresses with commas. Each person appears as a
          member immediately, so you can assign dues before their first Google sign-in.
          When email delivery is configured, they also receive sign-in instructions.
        </p>
      </section>

      <section className="card table-scroll" aria-labelledby="members-title">
        <div className="card-header">
          <span className="card-title" id="members-title">Members</span>
        </div>
        <MembersTable
          currentUserId={session?.userId ?? ""}
          members={profiles.map((profile) => ({
            id: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            role: profile.role,
            hasSignedIn: profile.has_signed_in,
            statusLabel: profile.has_signed_in ? "Signed in" : `Invited ${formatDate(profile.created_at)}`,
          }))}
        />
        <p className="helper-text px-6 pb-5">
          Invited people can be assigned dues before signing in. Removing someone
          revokes their invitation or access while preserving their financial history.
        </p>
      </section>
    </div>
  );
}

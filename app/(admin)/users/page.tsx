import { Button } from "@/components/brand/button";
import type { Metadata } from "next";

import { inviteUser, revokeInvite } from "@/app/(admin)/users/actions";
import { MembersTable } from "@/app/(admin)/users/members-table";
import { OptimisticDeleteButton } from "@/components/forms/optimistic-delete-button";
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
  const [profilesResult, invitesResult] = await Promise.all([
    loadAllPages((from, to) => supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .is("removed_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    loadAllPages((from, to) => supabase
      .from("invites")
      .select("email, role, created_at")
      .order("created_at", { ascending: true })
      .order("email", { ascending: true })
      .range(from, to)),
  ]);

  if (profilesResult.error) {
    throw new Error(`Unable to load members: ${profilesResult.error.message}`);
  }
  if (invitesResult.error) {
    throw new Error(`Unable to load invites: ${invitesResult.error.message}`);
  }

  const profiles = profilesResult.data ?? [];
  const invites = invitesResult.data ?? [];

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
          Separate multiple email addresses with commas. If someone has already signed
          in, their role updates right away. Otherwise it applies automatically on their
          first Google sign-in.
        </p>
      </section>

      <section className="card table-scroll" aria-labelledby="pending-invites-title">
        <div className="card-header">
          <span className="card-title" id="pending-invites-title">Pending invites</span>
        </div>
        {invites.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Invited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.email}>
                  <td>{invite.email}</td>
                  <td className="capitalize">{invite.role}</td>
                  <td className="whitespace-nowrap">{formatDate(invite.created_at)}</td>
                  <td>
                    <OptimisticDeleteButton action={revokeInvite} label="Revoke" name="email" value={invite.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state border-t border-rule">No pending invites.</div>
        )}
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
            joinedLabel: formatDate(profile.created_at),
          }))}
        />
        <p className="helper-text px-6 pb-5">
          Removing someone revokes their access and hides them from this list. Their
          reimbursement history is kept, and re-inviting their email restores them.
        </p>
      </section>
    </div>
  );
}

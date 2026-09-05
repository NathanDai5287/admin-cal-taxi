import type { Metadata } from "next";

import { inviteUser, revokeInvite } from "@/app/(admin)/users/actions";
import { MembersTable } from "@/app/(admin)/users/members-table";
import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function UsersPage() {
  const [session, supabase] = await Promise.all([getSessionProfile(), createClient()]);
  const [profilesResult, invitesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .is("removed_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("invites")
      .select("email, role, created_at")
      .order("created_at", { ascending: true }),
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
          <span className="card-title" id="invite-user-title">Invite a user</span>
        </div>
        <form action={inviteUser} className="card-body border-t border-rule pt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto] items-end">
          <div className="field">
            <label className="field-label" htmlFor="email">Email</label>
            <input className="field-input" id="email" name="email" required type="email" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="role">Role</label>
            <select className="field-input" defaultValue="member" id="role" name="role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn-primary" type="submit">Invite</button>
        </form>
        <p className="helper-text px-6 pb-5">
          If they&apos;ve already signed in, their role updates right away. Otherwise it
          applies automatically on their first Google sign-in.
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
                    <form action={revokeInvite}>
                      <input name="email" type="hidden" value={invite.email} />
                      <button className="btn-link" type="submit">Revoke</button>
                    </form>
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

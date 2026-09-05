import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { promoteMember, updateReimbursed, updateStatus } from "@/app/reimbursements/admin/actions";
import { AppHeader } from "@/components/reimbursements/app-header";
import { InviteForm } from "@/components/reimbursements/invite-form";
import { InlineStatusSelect } from "@/components/reimbursements/inline-status-select";
import { PromoteMemberButton } from "@/components/reimbursements/promote-member-button";
import { ReimbursedCheckbox } from "@/components/reimbursements/reimbursed-checkbox";
import { requireIdentity } from "@/lib/reimbursements/auth";
import { formatMoney, formatStatus } from "@/lib/reimbursements/format";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, userId, email } = await requireIdentity();

  // Both requests remain protected by RLS while the current user's role is
  // resolved from the profiles result.
  const [reimbursementsResult, profilesResult] = await Promise.all([
    supabase
      .from("reimbursements")
      .select("id, full_name, amount, category, status, merchant, receipt_total, reimbursed, submitted_at")
      .order("submitted_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .order("full_name"),
  ]);

  if (reimbursementsResult.error) {
    throw new Error(`Unable to load reimbursements: ${reimbursementsResult.error.message}`);
  }
  if (profilesResult.error) {
    throw new Error(`Unable to load member profiles: ${profilesResult.error.message}`);
  }

  const rows = reimbursementsResult.data ?? [];
  const members = profilesResult.data ?? [];
  const profile = members.find((member) => member.id === userId);

  if (!profile) redirect("/reimbursements/login");
  if (profile.role !== "admin") redirect("/reimbursements/dashboard");

  return (
    <main className="app-shell">
      <AppHeader email={email} isAdmin name={profile.full_name} />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Chapter administration</p>
            <h1>Review reimbursements</h1>
            <p>Invite people, manage access, and move submitted expenses through review.</p>
          </div>
        </div>

        <div className="admin-invite-grid">
          <section className="panel">
            <div className="panel-header"><h2>Invite a member</h2></div>
            <div className="panel-body"><InviteForm role="member" /></div>
          </section>

          <section className="panel">
            <div className="panel-header"><h2>Invite an admin</h2></div>
            <div className="panel-body"><InviteForm role="admin" /></div>
          </section>
        </div>

        <section className="panel table-scroll" style={{ marginBottom: 24 }}>
          <div className="panel-header"><h2>All members</h2></div>
          {members.length ? (
            <table className="admin-table member-table">
              <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th>Access</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>{member.full_name || "Unnamed member"}</td>
                    <td>{member.email || "—"}</td>
                    <td>{new Date(member.created_at).toLocaleDateString()}</td>
                    <td><span className={`badge badge-${member.role}`}>{formatStatus(member.role)}</span></td>
                    <td>
                      {member.role === "member" ? (
                        <form action={promoteMember}>
                          <input name="id" type="hidden" value={member.id} />
                          <PromoteMemberButton memberName={member.full_name || "this member"} />
                        </form>
                      ) : <span className="helper-text">Admin access</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state">No members found.</div>}
        </section>

        <section className="panel table-scroll">
          <div className="panel-header"><h2>All submissions</h2></div>
          {rows.length ? (
            <table className="admin-table">
              <thead><tr><th>Member</th><th>Expense</th><th>Requested</th><th>Receipt total</th><th>Status</th><th>Reimbursed</th><th>Review</th></tr></thead>
              <tbody>
                {rows.map((item) => (
                  <tr className="submission-row" key={item.id}>
                    <td>
                      <Link
                        aria-label={`Review submission from ${item.full_name}`}
                        className="submission-link"
                        href={`/reimbursements/admin/${item.id}`}
                      >
                        {item.full_name}
                      </Link>
                      <div className="receipt-meta">{new Date(item.submitted_at).toLocaleDateString()}</div>
                    </td>
                    <td>{item.merchant || formatStatus(item.category)}</td>
                    <td className="amount">{formatMoney(item.amount)}</td>
                    <td className="amount">{item.receipt_total === null ? "—" : formatMoney(item.receipt_total)}</td>
                    <td>
                      <form action={updateStatus} className="inline-status-form">
                        <input name="id" type="hidden" value={item.id} />
                        <InlineStatusSelect status={item.status} />
                      </form>
                    </td>
                    <td>
                      <form action={updateReimbursed} className="inline-status-form">
                        <input name="id" type="hidden" value={item.id} />
                        <ReimbursedCheckbox reimbursed={item.reimbursed} />
                      </form>
                    </td>
                    <td><span className="submission-row-action">Review submission <span aria-hidden="true">→</span></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state">No reimbursements to review.</div>}
        </section>
      </div>
    </main>
  );
}

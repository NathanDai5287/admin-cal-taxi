import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/reimbursements/app-header";
import { InviteForm } from "@/components/reimbursements/invite-form";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { formatMoney, formatStatus } from "@/lib/reimbursements/format";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const { data: reimbursements } = await supabase
    .from("reimbursements")
    .select("id, full_name, amount, category, status, merchant, receipt_total, submitted_at")
    .order("submitted_at", { ascending: false });

  const rows = reimbursements ?? [];

  return (
    <main className="app-shell">
      <AppHeader isAdmin />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Chapter administration</p>
            <h1>Review reimbursements</h1>
            <p>Invite members and move submitted expenses through review.</p>
          </div>
          <Link className="back-link" href="/reimbursements/dashboard">← Member dashboard</Link>
        </div>

        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header"><h2>Invite a member</h2></div>
          <div className="panel-body"><InviteForm /></div>
        </section>

        <section className="panel table-scroll">
          <div className="panel-header"><h2>All submissions</h2></div>
          {rows.length ? (
            <table className="admin-table">
              <thead><tr><th>Member</th><th>Expense</th><th>Requested</th><th>Receipt total</th><th>Status</th><th>Review</th></tr></thead>
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
                    <td><span className={`badge badge-${item.status}`}>{formatStatus(item.status)}</span></td>
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

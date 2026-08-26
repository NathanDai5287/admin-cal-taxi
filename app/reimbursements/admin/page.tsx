import type { Metadata } from "next";
import Link from "next/link";

import { updateStatus } from "@/app/reimbursements/admin/actions";
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
    .select("id, full_name, amount, category, status, merchant, receipt_path, submitted_at")
    .order("submitted_at", { ascending: false });

  const rows = await Promise.all((reimbursements ?? []).map(async (item) => {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(item.receipt_path, 300);
    return { ...item, receiptUrl: data?.signedUrl ?? null };
  }));

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
              <thead><tr><th>Member</th><th>Expense</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Review</th></tr></thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.full_name}</strong><div className="receipt-meta">{new Date(item.submitted_at).toLocaleDateString()}</div></td>
                    <td>{item.merchant || formatStatus(item.category)}</td>
                    <td className="amount">{formatMoney(item.amount)}</td>
                    <td><span className={`badge badge-${item.status}`}>{formatStatus(item.status)}</span></td>
                    <td>{item.receiptUrl ? <a className="back-link" href={item.receiptUrl} rel="noreferrer" target="_blank">View</a> : "—"}</td>
                    <td>
                      <div className="status-actions">
                        {(["pending", "approved", "denied"] as const).map((status) => (
                          <form action={updateStatus} key={status}>
                            <input name="id" type="hidden" value={item.id} />
                            <input name="status" type="hidden" value={status} />
                            <button disabled={item.status === status} type="submit">{formatStatus(status)}</button>
                          </form>
                        ))}
                      </div>
                    </td>
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

import type { Metadata } from "next";

import { AppHeader } from "@/components/reimbursements/app-header";
import { ReimbursementForm } from "@/components/reimbursements/reimbursement-form";
import { requireUser } from "@/lib/reimbursements/auth";
import { formatMoney, formatStatus } from "@/lib/reimbursements/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireUser();
  const { data: reimbursements } = await supabase
    .from("reimbursements")
    .select("id, category, amount, status, merchant, submitted_at")
    .order("submitted_at", { ascending: false });

  return (
    <main className="app-shell">
      <AppHeader isAdmin={profile.role === "admin"} />
      <div className="app-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Member dashboard</p>
            <h1>Hello{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.</h1>
            <p>Submit a chapter expense or check on an earlier request.</p>
          </div>
        </div>

        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-header"><h2>New reimbursement</h2></div>
            <div className="panel-body">
              <ReimbursementForm defaultName={profile.full_name} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><h2>Your submissions</h2></div>
            {reimbursements?.length ? (
              <div className="receipt-list">
                {reimbursements.map((item) => (
                  <article className="receipt-item" key={item.id}>
                    <div className="receipt-row">
                      <span className="receipt-title">
                        {item.merchant || formatStatus(item.category)}
                      </span>
                      <span className="amount">{formatMoney(item.amount)}</span>
                    </div>
                    <div className="receipt-row">
                      <span className="receipt-meta">
                        {new Date(item.submitted_at).toLocaleDateString()}
                      </span>
                      <span className={`badge badge-${item.status}`}>
                        {formatStatus(item.status)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">No reimbursements yet.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";

import { requireMember } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { formatCategory, formatMoney } from "@/lib/reimbursements/format";
import { memberPaymentStatus, memberStatus, memberSubmissionDate } from "@/lib/reimbursements/member-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reimbursements" };
const filters = [["all", "All"], ["progress", "In progress"], ["approved", "Approved"], ["paid", "Paid"], ["denied", "Denied"]] as const;
const pageSize = 20;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const { userId } = await requireMember();
  const params = await searchParams;
  const filter = filters.some(([key]) => key === params.filter) ? params.filter! : "all";
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const supabase = await createClient();
  // Explicit ownership filtering applies even for admins visiting their history.
  let query = supabase.from("reimbursements")
    .select("id, description, category, amount, status, reimbursed, submitted_at", { count: "exact" })
    .eq("user_id", userId);
  if (filter === "progress") query = query.in("status", ["pending", "verified", "mismatch", "processing_failed"]).eq("reimbursed", false);
  if (filter === "approved") query = query.eq("status", "approved").eq("reimbursed", false);
  if (filter === "paid") query = query.eq("reimbursed", true);
  if (filter === "denied") query = query.eq("status", "denied");
  const { data, error, count } = await query.order("submitted_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><p className="page-eyebrow">Chapter expenses</p><h1 className="page-title">My reimbursements</h1><p className="page-lede">Track your requests and payments.</p></div>
      </div>
      <div className="history-toolbar">
        <nav aria-label="Filter reimbursements" className="history-filters">
          {filters.map(([key, label]) => <Link key={key} href={`/history?filter=${key}`} aria-current={key === filter ? "page" : undefined}>{label}</Link>)}
        </nav>
      </div>
      {error ? <p role="alert" className="form-message">We couldn’t load your reimbursements. Please try refreshing.</p> : data?.length ? (
        <section aria-label="Submitted reimbursements" className="history-ledger">
          <div className="history-columns" aria-hidden="true"><span>Expense / submitted</span><span>Review / payment</span><span>Amount</span></div>
          <ul>
            {data.map(row => <li key={row.id}>
              <Link href={`/history/${row.id}`} className="history-row">
                <div className="history-expense"><h2>{row.description}</h2><p>{formatCategory(row.category)} <span aria-hidden="true">·</span> {memberSubmissionDate(row.submitted_at)}</p></div>
                <div className="history-status"><span data-status={row.status}>{memberStatus(row.status).label}</span><small data-paid={row.reimbursed}>{memberPaymentStatus(row.status, row.reimbursed)}</small></div>
                <div className="history-amount">{formatMoney(row.amount)}</div>
              </Link>
            </li>)}
          </ul>
        </section>
      ) : <section className="history-empty"><h2 className="font-semibold">{filter === "all" && page === 1 ? "No reimbursements yet" : "No reimbursements to show"}</h2><p className="mt-2 text-sm text-muted">{filter === "all" && page === 1 ? "Your submitted expenses and their statuses will appear here." : "Try another filter or return to the first page."}</p><Link href={filter === "all" && page === 1 ? "/" : "/history"} className="mt-4 inline-block text-sm text-brand underline">{filter === "all" && page === 1 ? "Submit your first reimbursement" : "View all reimbursements"}</Link></section>}
      {!error && <nav aria-label="History pages" className="mt-5 flex items-center justify-between text-sm">
        {page > 1 ? <Link href={`/history?filter=${filter}&page=${page - 1}`} className="text-brand">← Previous</Link> : <span />}
        {!!count && <span className="text-muted">Page {page} · {count} requests</span>}
        {page * pageSize < (count ?? 0) ? <Link href={`/history?filter=${filter}&page=${page + 1}`} className="text-brand">Next →</Link> : <span />}
      </nav>}
    </>
  );
}

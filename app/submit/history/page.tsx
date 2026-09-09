import Link from "next/link";

import { requireMember } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { formatCategory, formatMoney } from "@/lib/reimbursements/format";
import { memberPaymentStatus, memberStatus, memberSubmissionDate } from "@/lib/reimbursements/member-status";
import { MemberRefresh } from "@/components/reimbursements/member-refresh";
import { SignOutButton } from "@/components/reimbursements/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reimbursements" };
const filters = [["all", "All"], ["progress", "In progress"], ["approved", "Approved"], ["paid", "Paid"], ["denied", "Denied"]] as const;
const pageSize = 20;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const { userId, profile } = await requireMember();
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
        <div className="text-sm text-muted"><p className="mb-2">{profile.full_name}</p><SignOutButton action="/auth/signout" /></div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter reimbursements" className="flex flex-wrap gap-2">
          {filters.map(([key, label]) => <Link key={key} href={`/history?filter=${key}`} aria-current={key === filter ? "page" : undefined} className={`rounded border px-3 py-1 text-sm ${key === filter ? "border-brand bg-brand text-white" : "border-rule text-muted"}`}>{label}</Link>)}
        </nav>
        <MemberRefresh />
      </div>
      {error ? <p role="alert" className="form-message">We couldn’t load your reimbursements. Please try refreshing.</p> : data?.length ? (
        <div className="space-y-3">
          {data.map(row => <Link key={row.id} href={`/history/${row.id}`} className="card block p-5 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand">
            <div className="flex items-start justify-between gap-4"><h2 className="min-w-0 break-words font-semibold text-ink">{row.description.length > 120 ? `${row.description.slice(0, 120)}…` : row.description}</h2><span className="shrink-0 font-semibold">{formatMoney(row.amount)}</span></div>
            <p className="mt-2 text-xs text-muted">{formatCategory(row.category)} · Submitted {memberSubmissionDate(row.submitted_at)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="rounded bg-slate-100 px-2 py-1">{memberStatus(row.status).label}</span><span className={row.reimbursed ? "font-semibold text-brand" : "text-muted"}>{memberPaymentStatus(row.status, row.reimbursed)}</span><span className="ml-auto text-brand">View →</span></div>
          </Link>)}
        </div>
      ) : <section className="card p-6"><h2 className="font-semibold">{filter === "all" && page === 1 ? "No reimbursements yet" : "No reimbursements to show"}</h2><p className="mt-2 text-sm text-muted">{filter === "all" && page === 1 ? "Your submitted expenses and their statuses will appear here." : "Try another filter or return to the first page."}</p><Link href={filter === "all" && page === 1 ? "/" : "/history"} className="mt-4 inline-block text-sm text-brand underline">{filter === "all" && page === 1 ? "Submit your first reimbursement" : "View all reimbursements"}</Link></section>}
      {!error && <nav aria-label="History pages" className="mt-5 flex items-center justify-between text-sm">
        {page > 1 ? <Link href={`/history?filter=${filter}&page=${page - 1}`} className="text-brand">← Previous</Link> : <span />}
        {!!count && <span className="text-muted">Page {page} · {count} requests</span>}
        {page * pageSize < (count ?? 0) ? <Link href={`/history?filter=${filter}&page=${page + 1}`} className="text-brand">Next →</Link> : <span />}
      </nav>}
    </>
  );
}

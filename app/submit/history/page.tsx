import { requireMember } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { MemberHistory } from "@/components/reimbursements/member-history";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reimbursements" };
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ userId }, params] = await Promise.all([requireMember(), searchParams]);
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const supabase = await createClient();
  // Load the member's compact history once so paging is instant in the browser.
  const { data, error } = await loadAllPages((from, to) => supabase.from("reimbursements")
    .select("id, description, category, amount, status, reimbursed, submitted_at, payment_method")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to));
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><p className="page-eyebrow">Chapter expenses</p><h1 className="page-title">My reimbursements</h1><p className="page-lede">Track your requests and payments.</p></div>
      </div>
      {error ? <p role="alert" className="form-message">We couldn’t load your reimbursements. Please try reloading.</p> : <MemberHistory rows={data ?? []} initialPage={page} />}
    </>
  );
}

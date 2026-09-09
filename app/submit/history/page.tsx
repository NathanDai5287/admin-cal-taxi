import { requireMember } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { MemberHistory, memberHistoryFilters, type MemberHistoryFilter } from "@/components/reimbursements/member-history";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reimbursements" };
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const { userId } = await requireMember();
  const params = await searchParams;
  const filter: MemberHistoryFilter = memberHistoryFilters.some(([key]) => key === params.filter) ? params.filter as MemberHistoryFilter : "all";
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const supabase = await createClient();
  // Load the member's compact history once. Filters then switch instantly in
  // the browser without refetching or replacing the document.
  const { data, error } = await supabase.from("reimbursements")
    .select("id, description, category, amount, status, reimbursed, submitted_at")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false });
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><p className="page-eyebrow">Chapter expenses</p><h1 className="page-title">My reimbursements</h1><p className="page-lede">Track your requests and payments.</p></div>
      </div>
      {error ? <p role="alert" className="form-message">We couldn’t load your reimbursements. Please try reloading.</p> : <MemberHistory rows={data ?? []} initialFilter={filter} initialPage={page} />}
    </>
  );
}

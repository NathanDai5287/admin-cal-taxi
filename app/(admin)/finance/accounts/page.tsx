import { SpendingByCategory } from "@/components/finance/spending-by-category";
import { PrefetchRoutes } from "@/components/navigation/prefetch-routes";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { categoryBudgetsFromRows } from "@/lib/reimbursements/format";
import {
  loadReportManualExpenses,
  loadReportPageRows,
  parseReportFilters,
  summarizeApproved,
} from "@/lib/reimbursements/reports";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata = { title: "Accounts overview" };
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const filters = parseReportFilters({});
  const [budgetResult, rows, manualExpenses] = await Promise.all([
    supabase.from("reimbursement_budgets").select("*"),
    loadReportPageRows(supabase, filters),
    loadReportManualExpenses(supabase, filters),
  ]);

  if (budgetResult.error) {
    throw new Error(`Unable to load reimbursement budgets: ${budgetResult.error.message}`);
  }

  const summary = summarizeApproved(rows, manualExpenses);
  const reviewHrefs = Object.values(summary.byCategoryItems)
    .flat()
    .filter((item) => item.source === "receipt")
    .map((item) => `/finance/review/${item.id}`);

  return (
    <>
      <PrefetchRoutes hrefs={reviewHrefs} />
      <SpendingByCategory
        budgets={categoryBudgetsFromRows(budgetResult.data)}
        summary={summary}
      />
    </>
  );
}

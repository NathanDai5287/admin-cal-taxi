import { SpendingByCategory } from "@/components/finance/spending-by-category";
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

  return (
    <SpendingByCategory
      budgets={categoryBudgetsFromRows(budgetResult.data)}
      summary={summarizeApproved(rows, manualExpenses)}
    />
  );
}

import { requireAdmin } from "@/lib/reimbursements/auth";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

import { DonationForecastForm } from "./donation-forecast-form";
import { IncomeEntryForm } from "./income-entry-form";
import { ManualExpenseForm } from "./manual-expense-form";
import { OpeningCashForm } from "./opening-cash-form";

export const metadata = { title: "Account activity" };
export const dynamic = "force-dynamic";

function currentPacificDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function ActivityPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const results = await Promise.all([
    loadAllPages((from, to) => supabase.from("reimbursement_manual_expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false }).range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursement_budget_entries").select("*").eq("kind", "income").order("budget_date", { ascending: false }).order("id", { ascending: false }).range(from, to)),
    supabase.from("chapter_financial_settings").select("opening_cash").eq("id", true).maybeSingle(),
    loadAllPages((from, to) => supabase.from("reimbursement_budget_entries").select("*").eq("kind", "forecast").eq("source", "alumni_donations").order("budget_date", { ascending: false }).order("id", { ascending: false }).range(from, to)),
  ]);
  for (const result of results) if (result.error) throw new Error(`Unable to load account activity: ${result.error.message}`);
  const manualExpenses = (results[0].data ?? []).map((expense) => ({
    id: expense.id,
    expense_date: expense.expense_date,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    receiptUrl: expense.receipt_path ? `/api/reimbursements/receipts/manual/${expense.id}` : undefined,
  }));
  const entries = (results[1].data ?? []).map((entry) => ({
    id: entry.id,
    budget_date: entry.budget_date,
    description: entry.description,
    amount: Number(entry.amount),
    source: entry.source,
  }));
  const donationForecasts = (results[3].data ?? []).map((entry) => ({
    id: entry.id,
    budget_date: entry.budget_date,
    description: entry.description,
    amount: Number(entry.amount),
  }));
  const today = currentPacificDate();

  return <div className="grid gap-6">
    <div><p className="page-eyebrow">Chapter finances</p><h1 className="page-title">Other transactions</h1><p className="page-lede">Use this page for money that is not already recorded through dues or reimbursements.</p></div>

    <section className="grid gap-3 md:grid-cols-3" aria-labelledby="transaction-choice-title">
      <h2 className="sr-only" id="transaction-choice-title">Choose a transaction type</h2>
      <a className="account-choice" href="#record-expense"><strong>Chapter paid an expense</strong><span>Record a direct purchase or vendor payment.</span></a>
      <a className="account-choice" href="#donations"><strong>Plan or record a donation</strong><span>Keep expected and received donations separate.</span></a>
      <a className="account-choice" href="#opening-cash"><strong>Set opening cash</strong><span>Update the starting balance used by reports.</span></a>
    </section>

    <section className="card scroll-mt-28" aria-labelledby="manual-expense-title" id="record-expense">
      <div className="card-header">
        <span className="card-title" id="manual-expense-title">Record a direct expense</span>
        <span className="card-subtitle">Use this when the chapter paid directly. Member reimbursements belong in Review.</span>
      </div>
      <ManualExpenseForm expenses={manualExpenses} today={today} />
    </section>

    <section className="card scroll-mt-28" aria-labelledby="add-income-title" id="donations">
      <div className="card-header">
        <span className="card-title" id="add-income-title">Donations</span>
        <span className="card-subtitle">Forecast expected gifts and record received gifts separately.</span>
      </div>
      <DonationForecastForm forecasts={donationForecasts} today={today} />
      <IncomeEntryForm entries={entries} today={today} />
    </section>

    <section className="card scroll-mt-28" id="opening-cash">
      <div className="card-header"><span className="card-title">Opening cash</span><span className="card-subtitle">Account setup used by financial reports.</span></div>
      <OpeningCashForm openingCash={results[2].data?.opening_cash ?? 0} />
    </section>
  </div>;
}

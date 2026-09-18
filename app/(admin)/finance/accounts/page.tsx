import Link from "next/link";

import { ButtonLink } from "@/components/brand/button";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { formatMoney } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

export const metadata = { title: "Accounts overview" };
export const dynamic = "force-dynamic";

function currentPacificDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default async function AccountsPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const [receivablesResult, payablesResult, manualExpensesResult, incomeResult] = await Promise.all([
    loadAllPages((from, to) => supabase.from("chapter_receivables").select("id, amount_assessed, amount_paid, due_date").order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursements").select("id, amount").eq("status", "approved").eq("reimbursed", false).order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursement_manual_expenses").select("id, amount").order("id").range(from, to)),
    loadAllPages((from, to) => supabase.from("reimbursement_budget_entries").select("id, amount").eq("kind", "income").order("id").range(from, to)),
  ]);

  const failed = [receivablesResult, payablesResult, manualExpensesResult, incomeResult]
    .find((result) => result.error)?.error;
  if (failed) throw new Error(`Unable to load the accounts overview: ${failed.message}`);

  const today = currentPacificDate();
  const balances = (receivablesResult.data ?? []).map((row) => ({
    dueDate: row.due_date,
    outstanding: Math.max(0, Number(row.amount_assessed) - Number(row.amount_paid)),
  }));
  const openBalances = balances.filter((row) => row.outstanding > 0);
  const overdueBalances = openBalances.filter((row) => row.dueDate < today);
  const totalReceivable = openBalances.reduce((sum, row) => sum + row.outstanding, 0);
  const totalPayable = (payablesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const recordedIncome = (incomeResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const directSpending = (manualExpensesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-eyebrow">Chapter finances</p>
          <h1 className="page-title">Accounts overview</h1>
          <p className="page-lede">See what needs attention, then choose the type of money you want to record.</p>
        </div>
        <ButtonLink href="/finance/accounts/activity#record-expense" variant="primary">Record an expense</ButtonLink>
      </div>

      <section className="stat-grid" aria-label="Accounts requiring attention">
        <Link className="stat stat-primary group" href="/finance/accounts/receivable">
          <span>Dues still to collect</span>
          <strong>{formatMoney(totalReceivable)}</strong>
          <small>{openBalances.length} open {openBalances.length === 1 ? "balance" : "balances"} <span aria-hidden="true">→</span></small>
        </Link>
        <Link className="stat group" href="/finance/accounts/receivable">
          <span>Overdue dues</span>
          <strong className={overdueBalances.length ? "text-warn" : ""}>{formatMoney(overdueBalances.reduce((sum, row) => sum + row.outstanding, 0))}</strong>
          <small>{overdueBalances.length ? `${overdueBalances.length} ${overdueBalances.length === 1 ? "balance needs" : "balances need"} follow-up` : "Nothing overdue"} <span aria-hidden="true">→</span></small>
        </Link>
        <Link className="stat group" href="/finance/accounts/payable">
          <span>Reimbursements to pay</span>
          <strong>{formatMoney(totalPayable)}</strong>
          <small>{(payablesResult.data ?? []).length} approved {(payablesResult.data ?? []).length === 1 ? "request" : "requests"} <span aria-hidden="true">→</span></small>
        </Link>
      </section>

      <section aria-labelledby="choose-task-title">
        <div className="mb-4">
          <h2 className="text-[18px] font-bold text-ink" id="choose-task-title">What do you need to do?</h2>
          <p className="mt-1 text-[13px] text-muted">Each area owns one kind of financial record.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link className="account-workflow-card" href="/finance/accounts/receivable">
            <span className="account-workflow-number">1</span>
            <div><h3>Collect member dues</h3><p>Assign dues, record payments, and remind members with open balances.</p></div>
            <ArrowIcon />
          </Link>
          <Link className="account-workflow-card" href="/finance/accounts/payable">
            <span className="account-workflow-number">2</span>
            <div><h3>Manage reimbursements</h3><p>Review requests and record approved payouts in one place.</p></div>
            <ArrowIcon />
          </Link>
          <Link className="account-workflow-card" href="/finance/accounts/activity">
            <span className="account-workflow-number">3</span>
            <div><h3>Record another transaction</h3><p>Add direct chapter spending or income that did not come through dues.</p></div>
            <ArrowIcon />
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="recorded-activity-title">
        <div className="card-header">
          <span className="card-title" id="recorded-activity-title">Other recorded activity</span>
          <span className="card-subtitle">Transactions entered directly in Accounts.</span>
        </div>
        <div className="grid border-t border-rule sm:grid-cols-2">
          <div className="px-6 py-5 sm:border-r sm:border-rule"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Income recorded</p><strong className="mt-2 block text-[24px] tabular-nums">{formatMoney(recordedIncome)}</strong></div>
          <div className="px-6 py-5"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Direct spending recorded</p><strong className="mt-2 block text-[24px] tabular-nums">{formatMoney(directSpending)}</strong></div>
        </div>
      </section>
    </div>
  );
}

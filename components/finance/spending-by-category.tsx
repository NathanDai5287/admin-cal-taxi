import Link from "next/link";

import { categories, formatMoney, type ReimbursementCategory } from "@/lib/reimbursements/format";
import type { summarizeApproved } from "@/lib/reimbursements/reports";

type SpendingSummary = ReturnType<typeof summarizeApproved>;

function remainingText(limit: number | null, spent: number) {
  if (limit === null) return "No limit";
  const remaining = limit - spent;
  return remaining >= 0 ? `${formatMoney(remaining)} remaining` : `${formatMoney(Math.abs(remaining))} over`;
}

function formatExpenseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export function SpendingByCategory({
  budgets,
  summary,
}: {
  budgets: Map<ReimbursementCategory, number | null>;
  summary: SpendingSummary;
}) {
  const maximumCategorySpend = Math.max(...Object.values(summary.byCategory), 1);

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Spending by category</span>
        <span className="card-subtitle">Approved receipts and manual entries are included.</span>
      </div>
      <div className="spend-list border-t border-rule">
        {categories.map(([category, label]) => {
          const spent = summary.byCategory[category];
          const limit = budgets.get(category) ?? null;
          const barMaximum = limit !== null ? Math.max(limit, spent, 1) : maximumCategorySpend;
          const width = spent === 0 ? 0 : Math.max(2, Math.min(100, (spent / barMaximum) * 100));
          const overBudget = limit !== null && spent > limit;
          const items = summary.byCategoryItems[category];

          return (
            <article className="spend-row" key={category}>
              <div className="spend-row-heading"><strong className="text-[13.5px]">{label}</strong><span>{formatMoney(spent)}</span></div>
              <div className="spend-track" aria-hidden="true"><span className={overBudget ? "is-over" : ""} style={{ width: `${width}%` }} /></div>
              <div className={`spend-row-meta${overBudget ? " is-over" : ""}`}><span>{limit === null ? "No category limit" : `${formatMoney(limit)} budget`}</span><span>{remainingText(limit, spent)}</span></div>
              {items.length > 0 && (
                <details className="spend-breakdown">
                  <summary>{items.length} {items.length === 1 ? "item" : "items"} make up this total</summary>
                  <div className="spend-breakdown-list">
                    {items.map((item) => (
                      <div className="spend-breakdown-item" key={`${item.source}-${item.id}`}>
                        <div>
                          {item.source === "receipt"
                            ? <Link href={`/finance/review/${item.id}`}>{item.description}</Link>
                            : <span>{item.description}</span>}
                          <small>{formatExpenseDate(item.date)} · {item.source === "receipt" ? "Receipt" : "Manual"}</small>
                        </div>
                        <strong>{formatMoney(item.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

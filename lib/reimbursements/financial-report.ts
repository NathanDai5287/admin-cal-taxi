import { categories, formatCategory } from "./format";
import type { ReimbursementCategory } from "./format";

export const incomeSources = [
  ["active_member_dues", "Active member dues"],
  ["new_member_fees", "New member fees"],
  ["fundraising", "Fundraising"],
  ["alumni_donations", "Alumni donations"],
  ["other", "Other income"],
] as const;

export type IncomeSource = (typeof incomeSources)[number][0];

export type FinancialReportInput = {
  chapterName: string;
  termLabel: string;
  termStart: string;
  termEnd: string;
  openingCash: number;
  generatedAt: string;
  incomeEntries: Array<{
    source: IncomeSource;
    amount: number;
  }>;
  categoryBudgets: Partial<Record<ReimbursementCategory, number | null>>;
  reimbursements: Array<{
    category: ReimbursementCategory;
    amount: number;
    reimbursed: boolean;
  }>;
  manualExpenses: Array<{
    category: ReimbursementCategory;
    amount: number;
  }>;
  receivables: Array<{
    amountAssessed: number;
    amountPaid: number;
  }>;
  outstandingLiabilities: number;
};

export type FinancialReport = ReturnType<typeof buildFinancialReport>;

const chartColors = [
  "#0A5482",
  "#D97706",
  "#2F855A",
  "#805AD5",
  "#C53030",
  "#0F766E",
  "#B7791F",
  "#4A5568",
] as const;

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function cents(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function dollars(value: number) {
  return value / 100;
}

export function buildFinancialReport(input: FinancialReportInput) {
  const incomeCents = Object.fromEntries(incomeSources.map(([source]) => [source, 0])) as Record<IncomeSource, number>;
  for (const entry of input.incomeEntries) {
    incomeCents[entry.source] += cents(entry.amount);
  }

  const actualCents = Object.fromEntries(categories.map(([category]) => [category, 0])) as Record<ReimbursementCategory, number>;
  let paidReimbursementCents = 0;

  for (const reimbursement of input.reimbursements) {
    const amount = cents(reimbursement.amount);
    actualCents[reimbursement.category] += amount;
    if (reimbursement.reimbursed) paidReimbursementCents += amount;
  }

  let manualExpenseCents = 0;
  for (const expense of input.manualExpenses) {
    const amount = cents(expense.amount);
    actualCents[expense.category] += amount;
    manualExpenseCents += amount;
  }

  const totalIncomeCents = Object.values(incomeCents).reduce((total, amount) => total + amount, 0);
  const totalActualCents = Object.values(actualCents).reduce((total, amount) => total + amount, 0);
  const openingCashCents = cents(input.openingCash);
  const cashPositionCents = openingCashCents + totalIncomeCents - paidReimbursementCents - manualExpenseCents;
  const netOperatingCents = totalIncomeCents - totalActualCents;
  const accountsReceivableCents = input.receivables.reduce(
    (total, row) => total + Math.max(0, cents(row.amountAssessed) - cents(row.amountPaid)),
    0,
  );

  const incomeBreakdown = incomeSources.map(([source, label]) => {
    const amountDollars = dollars(incomeCents[source]);
    const share = totalIncomeCents > 0 ? Math.round((incomeCents[source] / totalIncomeCents) * 10000) / 10000 : 0;
    return {
      source,
      label: titleCase(label),
      amount: amountDollars,
      share,
      percentage: Math.round(share * 1000) / 10,
    };
  });

  const expenseBreakdown = categories.map(([category]) => {
    const budgetValue = input.categoryBudgets[category];
    const budgetedCents = budgetValue === null || budgetValue === undefined ? null : cents(budgetValue);
    const spentCents = actualCents[category];
    return {
      category,
      label: titleCase(formatCategory(category)),
      budgeted: budgetedCents === null ? null : dollars(budgetedCents),
      actual: dollars(spentCents),
      remaining: budgetedCents === null ? null : dollars(budgetedCents - spentCents),
      percentageUsed: budgetedCents === null || budgetedCents === 0
        ? null
        : Math.round((spentCents / budgetedCents) * 10000) / 100,
    };
  });

  const totalBudgetedCents = expenseBreakdown.reduce(
    (total, row) => total + (row.budgeted === null ? 0 : cents(row.budgeted)),
    0,
  );
  const incomeChartRows = incomeBreakdown.filter((row) => row.amount > 0);
  const expenseChartRows = expenseBreakdown.filter((row) => row.actual > 0);

  return {
    meta: {
      chapterName: input.chapterName,
      termLabel: input.termLabel,
      termStart: input.termStart,
      termEnd: input.termEnd,
      generatedAt: input.generatedAt,
      currency: "USD",
    },
    executiveSnapshot: {
      openingCash: dollars(openingCashCents),
      cashPosition: dollars(cashPositionCents),
      totalIncome: dollars(totalIncomeCents),
      totalExpenses: dollars(totalActualCents),
      netOperating: dollars(netOperatingCents),
      operatingStatus: netOperatingCents >= 0 ? "surplus" as const : "deficit" as const,
    },
    incomeBreakdown,
    expenseBreakdown,
    budgetSummary: {
      totalBudgeted: dollars(totalBudgetedCents),
      totalActual: dollars(totalActualCents),
      totalRemaining: dollars(totalBudgetedCents - totalActualCents),
      percentageUsed: totalBudgetedCents > 0
        ? Math.round((totalActualCents / totalBudgetedCents) * 10000) / 100
        : null,
    },
    outstandingBalances: {
      accountsReceivable: dollars(accountsReceivableCents),
      outstandingLiabilities: dollars(cents(input.outstandingLiabilities)),
    },
    charts: {
      revenueDistribution: {
        type: "pie" as const,
        labels: incomeChartRows.map((row) => row.label),
        datasets: [{
          label: "Revenue",
          data: incomeChartRows.map((row) => row.amount),
          backgroundColor: incomeChartRows.map((_, index) => chartColors[index % chartColors.length]),
        }],
        proportions: incomeChartRows.map((row) => row.percentage),
        items: incomeChartRows.map((row, index) => ({
          source: row.source,
          label: row.label,
          amount: row.amount,
          percentage: row.percentage,
          color: chartColors[index % chartColors.length],
        })),
      },
      expenseDistribution: {
        type: "pie" as const,
        labels: expenseChartRows.map((row) => row.label),
        datasets: [{
          label: "Actual spending",
          data: expenseChartRows.map((row) => row.actual),
          backgroundColor: expenseChartRows.map((_, index) => chartColors[index % chartColors.length]),
        }],
        proportions: expenseChartRows.map((row) =>
          totalActualCents > 0
            ? Math.round((cents(row.actual) / totalActualCents) * 1000) / 10
            : 0,
        ),
        items: expenseChartRows.map((row, index) => ({
          category: row.category,
          label: row.label,
          amount: row.actual,
          percentage: totalActualCents > 0
            ? Math.round((cents(row.actual) / totalActualCents) * 1000) / 10
            : 0,
          color: chartColors[index % chartColors.length],
        })),
      },
      budgetVsActual: {
        type: "bar" as const,
        labels: expenseBreakdown.map((row) => row.label),
        datasets: [
          {
            label: "Budgeted",
            data: expenseBreakdown.map((row) => row.budgeted ?? 0),
            backgroundColor: "#A9D6E5",
          },
          {
            label: "Actual",
            data: expenseBreakdown.map((row) => row.actual),
            backgroundColor: "#0A5482",
          },
        ],
        items: expenseBreakdown.map((row) => ({
          category: row.category,
          label: row.label,
          budgeted: row.budgeted ?? 0,
          actual: row.actual,
          remaining: row.remaining ?? 0,
          percentageUsed: row.percentageUsed,
        })),
      },
    },
  };
}

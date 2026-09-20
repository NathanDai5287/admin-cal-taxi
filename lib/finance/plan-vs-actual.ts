import { categories, type ReimbursementCategory } from "@/lib/reimbursements/format";

type IncomeEntry = {
  amount: number;
  kind: "forecast" | "income";
  source: string;
};

type Receivable = {
  amountAssessed: number;
  waived: boolean;
};

type DuesPayment = {
  amount: number;
};

type Expense = {
  amount: number;
  category: ReimbursementCategory;
};

type HostingOrder = {
  plannedRevenue: number;
  plannedFirePermit: number;
  status: "confirmed" | "cancelled";
};

type HostingPayment = {
  amount: number;
  kind: "revenue" | "fire_permit";
};

export type PlanVsActualInput = {
  categoryBudgets: Partial<Record<ReimbursementCategory, number | null>>;
  receivables: Receivable[];
  duesPayments: DuesPayment[];
  incomeEntries: IncomeEntry[];
  approvedReimbursements: Expense[];
  directExpenses: Expense[];
  hostingOrders: HostingOrder[];
  hostingPayments: HostingPayment[];
};

const legacyDuesSources = new Set(["active_member_dues", "new_member_fees"]);

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(value: number) {
  return value / 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + cents(value), 0);
}

export function buildPlanVsActual(input: PlanVsActualInput) {
  const duesPlanned = sum(input.receivables.filter((row) => !row.waived).map((row) => row.amountAssessed));
  const duesActual = sum(input.duesPayments.map((payment) => payment.amount));
  const donationEntries = input.incomeEntries.filter((entry) => !legacyDuesSources.has(entry.source));
  const donationsPlanned = sum(donationEntries.filter((entry) => entry.kind === "forecast").map((entry) => entry.amount));
  const donationsActual = sum(donationEntries.filter((entry) => entry.kind === "income").map((entry) => entry.amount));
  const confirmedHosting = input.hostingOrders.filter((order) => order.status === "confirmed");
  const hostingPlanned = sum(confirmedHosting.map((order) => order.plannedRevenue));
  const hostingActual = sum(input.hostingPayments.filter((payment) => payment.kind === "revenue").map((payment) => payment.amount));

  const actualExpenses = [...input.approvedReimbursements, ...input.directExpenses];
  const expenseBreakdown = categories.map(([category, label]) => {
    const planned = cents(input.categoryBudgets[category] ?? 0)
      + (category === "house"
        ? sum(confirmedHosting.map((order) => order.plannedFirePermit))
        : 0);
    const actual = sum(actualExpenses.filter((expense) => expense.category === category).map((expense) => expense.amount))
      + (category === "house"
        ? sum(input.hostingPayments.filter((payment) => payment.kind === "fire_permit").map((payment) => payment.amount))
        : 0);
    return { category, label, planned: dollars(planned), actual: dollars(actual) };
  });

  const incomeBreakdown = [
    { source: "dues", label: "Dues", planned: dollars(duesPlanned), actual: dollars(duesActual), href: "/finance/accounts/receivable" },
    { source: "donations", label: "Donations", planned: dollars(donationsPlanned), actual: dollars(donationsActual), href: "/finance/accounts/activity#donations" },
    { source: "hosting", label: "Hosting", planned: dollars(hostingPlanned), actual: dollars(hostingActual), href: "/host/orders" },
  ] as const;

  const plannedIncome = incomeBreakdown.reduce((total, row) => total + cents(row.planned), 0);
  const actualIncome = incomeBreakdown.reduce((total, row) => total + cents(row.actual), 0);
  const plannedExpenses = expenseBreakdown.reduce((total, row) => total + cents(row.planned), 0);
  const actualExpenseTotal = expenseBreakdown.reduce((total, row) => total + cents(row.actual), 0);

  return {
    plannedIncome: dollars(plannedIncome),
    actualIncome: dollars(actualIncome),
    plannedExpenses: dollars(plannedExpenses),
    actualExpenses: dollars(actualExpenseTotal),
    incomeBreakdown,
    expenseBreakdown,
    excludedLegacyDues: input.incomeEntries.filter((entry) => legacyDuesSources.has(entry.source)),
  };
}

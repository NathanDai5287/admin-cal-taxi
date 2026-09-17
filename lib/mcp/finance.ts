type MoneyValue = number | string | null;

export type FinanceOverviewInput = {
  openingCash: MoneyValue;
  income: MoneyValue[];
  reimbursements: Array<{ amount: MoneyValue; status: string; reimbursed: boolean }>;
  manualExpenses: MoneyValue[];
  receivables: Array<{ amountAssessed: MoneyValue; amountPaid: MoneyValue }>;
};

function cents(value: MoneyValue) {
  return Math.round(Number(value ?? 0) * 100);
}

function dollars(value: number) {
  return value / 100;
}

export function buildFinanceOverview(input: FinanceOverviewInput) {
  const openingCash = cents(input.openingCash);
  const income = input.income.reduce<number>((total, amount) => total + cents(amount), 0);
  const approved = input.reimbursements.filter((row) => row.status === "approved");
  const approvedSpending = approved.reduce<number>((total, row) => total + cents(row.amount), 0);
  const paidReimbursements = approved
    .filter((row) => row.reimbursed)
    .reduce<number>((total, row) => total + cents(row.amount), 0);
  const unpaidReimbursements = approvedSpending - paidReimbursements;
  const directSpending = input.manualExpenses.reduce<number>((total, amount) => total + cents(amount), 0);
  const accountsReceivable = input.receivables.reduce<number>(
    (total, row) => total + Math.max(0, cents(row.amountAssessed) - cents(row.amountPaid)),
    0,
  );

  return {
    currency: "USD",
    openingCash: dollars(openingCash),
    recordedIncome: dollars(income),
    approvedSpending: dollars(approvedSpending + directSpending),
    cashPosition: dollars(openingCash + income - paidReimbursements - directSpending),
    accountsReceivable: dollars(accountsReceivable),
    reimbursementsToPay: dollars(unpaidReimbursements),
  };
}

export function buildBudgetCategories(
  budgets: Array<{ budgetKey: string; amount: MoneyValue }>,
  reimbursements: Array<{ category: string; amount: MoneyValue; status: string }>,
  manualExpenses: Array<{ category: string; amount: MoneyValue }>,
) {
  const spent = new Map<string, number>();
  for (const row of reimbursements) {
    if (row.status !== "approved") continue;
    spent.set(row.category, (spent.get(row.category) ?? 0) + cents(row.amount));
  }
  for (const row of manualExpenses) {
    spent.set(row.category, (spent.get(row.category) ?? 0) + cents(row.amount));
  }

  const categoryNames = new Set([
    ...budgets.map((row) => row.budgetKey),
    ...spent.keys(),
  ]);
  return [...categoryNames].sort().map((category) => {
    const budget = budgets.find((row) => row.budgetKey === category)?.amount;
    const budgetCents = budget === null || budget === undefined ? null : cents(budget);
    const spentCents = spent.get(category) ?? 0;
    return {
      category,
      budget: budgetCents === null ? null : dollars(budgetCents),
      spent: dollars(spentCents),
      remaining: budgetCents === null ? null : dollars(budgetCents - spentCents),
    };
  });
}

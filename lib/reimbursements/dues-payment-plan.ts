export type PaymentPlanFrequency = "weekly" | "biweekly" | "monthly" | "custom";

export type DuesPaymentPlan = {
  frequency: PaymentPlanFrequency;
  amount: number;
  intervalDays: number | null;
};

export function paymentPlanFrequencyLabel(plan: DuesPaymentPlan) {
  switch (plan.frequency) {
    case "weekly": return "weekly";
    case "biweekly": return "every two weeks";
    case "monthly": return "monthly";
    case "custom": return `every ${plan.intervalDays} ${plan.intervalDays === 1 ? "day" : "days"}`;
  }
}

export function defaultDuesPaymentAmount(row: { amountOwed: number; paymentPlan: DuesPaymentPlan | null }) {
  if (!row.paymentPlan || row.amountOwed <= 0) return "";
  const cents = Math.min(Math.round(row.paymentPlan.amount * 100), Math.round(row.amountOwed * 100));
  return (cents / 100).toFixed(2);
}

type SortableBalance = {
  id: string;
  memberName: string;
  dueDate: string;
  amountOwed: number;
  isPaid: boolean;
  paymentPlan: DuesPaymentPlan | null;
};

export function compareDuesBalances(a: SortableBalance, b: SortableBalance, sort: string) {
  const priority = Number(!b.isPaid && Boolean(b.paymentPlan)) - Number(!a.isPaid && Boolean(a.paymentPlan));
  return priority
    || (sort === "name" ? a.memberName.localeCompare(b.memberName)
      : sort === "amount" ? b.amountOwed - a.amountOwed
        : a.dueDate.localeCompare(b.dueDate))
    || a.memberName.localeCompare(b.memberName)
    || a.id.localeCompare(b.id);
}

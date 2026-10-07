export type PaymentPlanFrequency = "weekly" | "biweekly" | "monthly" | "custom";

export type DuesPaymentPlan = {
  frequency: PaymentPlanFrequency;
  amount: number;
  intervalDays: number | null;
};

// Display/optimistic preview only; the database calculates the saved due date.
export function paymentPlanDueDate(start: string, plan: DuesPaymentPlan, paid: number, assessed: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start || start < "0001-01-01") return null;
  const amountCents = Math.round(plan.amount * 100);
  if (amountCents <= 0) return null;
  const index = Math.min(Math.floor(Math.round(paid * 100) / amountCents), Math.max(Math.ceil(Math.round(assessed * 100) / amountCents) - 1, 0));
  if (plan.frequency === "monthly") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + index);
    const lastDay = new Date(date.getTime());
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  } else {
    const days = plan.frequency === "weekly" ? 7 : plan.frequency === "biweekly" ? 14 : plan.intervalDays;
    if (!days || days < 1) return null;
    date.setUTCDate(date.getUTCDate() + index * days);
  }
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  return date.toISOString().slice(0, 10);
}

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

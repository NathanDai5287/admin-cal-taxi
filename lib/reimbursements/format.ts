import { z } from "zod";

export const reimbursementSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  category: z.enum(["food", "supplies", "travel", "events", "utilities", "other"]),
  amount: z.coerce.number().positive().max(99_999_999.99),
  description: z.string().trim().min(1).max(2000),
  paymentMethod: z.string().trim().min(1).max(200),
});

export const categories = [
  ["food", "Food"],
  ["supplies", "Supplies"],
  ["travel", "Travel"],
  ["events", "Events"],
  ["utilities", "Utilities"],
  ["other", "Other"],
] as const;

export function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

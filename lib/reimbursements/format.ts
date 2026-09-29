import { z } from "zod";

export const categoryRegistry = [
  { value: "administration", label: "ADMINISTRATION" },
  { value: "rush", label: "RUSH" },
  { value: "socials", label: "SOCIALS" },
  { value: "education", label: "EDUCATION" },
  { value: "philanthropy", label: "PHILANTHROPY" },
  { value: "brother_bonding", label: "BROTHER BONDING" },
  { value: "retreat", label: "RETREAT" },
  { value: "house", label: "HOUSE" },
  { value: "miscellaneous_fees", label: "MISCELLANEOUS FEES" },
] as const;

export type ReimbursementCategory = (typeof categoryRegistry)[number]["value"];

export const categoryValues = categoryRegistry.map(({ value }) => value) as [
  ReimbursementCategory,
  ...ReimbursementCategory[],
];

export const categories = categoryRegistry.map(({ value, label }) => [value, label] as const);
export const categorySchema = z.enum(categoryValues);

const categoryLabels = new Map<string, string>(categories);

export const reimbursementSchema = z.object({
  category: categorySchema,
  amount: z.coerce.number().positive().max(99_999_999.99),
  description: z.string().trim().min(1).max(2000),
  paymentMethod: z.string().trim().min(1).max(200),
});

export function categoryBudgetMap(value: unknown) {
  const budgets = new Map<ReimbursementCategory, number | null>();
  if (!value || typeof value !== "object" || Array.isArray(value)) return budgets;

  for (const category of categoryValues) {
    const amount = (value as Record<string, unknown>)[category];
    if (amount === null) budgets.set(category, null);
    if (typeof amount === "number" && Number.isFinite(amount)) budgets.set(category, amount);
  }
  return budgets;
}

export function categoryBudgetsFromRows(value: unknown) {
  if (!Array.isArray(value)) return categoryBudgetMap(undefined);
  const current = value.find((row) => row && typeof row === "object" && "category_amounts" in row);
  if (current) return categoryBudgetMap((current as { category_amounts: unknown }).category_amounts);

  const legacy = Object.fromEntries(value.flatMap((row) => {
    if (!row || typeof row !== "object" || !("budget_key" in row) || !("amount" in row)) return [];
    return [[String(row.budget_key), row.amount]];
  }));
  return categoryBudgetMap(legacy);
}

export function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export function formatReimbursementDate(value: string | null, includeTime = false) {
  if (!value) return "Not detected";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: includeTime ? "America/Los_Angeles" : "UTC",
  }).format(new Date(value));
}

export function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function formatCategory(value: string) {
  return categoryLabels.get(value) ?? formatStatus(value).toUpperCase();
}

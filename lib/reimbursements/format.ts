import { z } from "zod";

export const categoryValues = [
  "administration",
  "rush",
  "socials",
  "education",
  "philanthropy",
  "brother_bonding",
  "retreat",
  "house",
  "miscellaneous_fees",
] as const;

export const reimbursementSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  category: z.enum(categoryValues),
  amount: z.coerce.number().positive().max(99_999_999.99),
  description: z.string().trim().min(1).max(2000),
  paymentMethod: z.string().trim().min(1).max(200),
});

export const categories = [
  ["administration", "ADMINISTRATION"],
  ["rush", "RUSH"],
  ["socials", "SOCIALS"],
  ["education", "EDUCATION"],
  ["philanthropy", "PHILANTHROPY"],
  ["brother_bonding", "BROTHER BONDING"],
  ["retreat", "RETREAT"],
  ["house", "HOUSE"],
  ["miscellaneous_fees", "MISCELLANEOUS FEES"],
] as const;

export type ReimbursementCategory = (typeof categoryValues)[number];

const categoryLabels = new Map<string, string>(categories);

export function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function formatCategory(value: string) {
  return categoryLabels.get(value) ?? formatStatus(value).toUpperCase();
}

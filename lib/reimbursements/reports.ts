import type { SupabaseClient } from "@supabase/supabase-js";

import { categories } from "@/lib/reimbursements/format";
import type { Database } from "@/lib/reimbursements/supabase/database.types";

export const reimbursementStatuses = [
  "pending",
  "verified",
  "mismatch",
  "approved",
  "denied",
  "processing_failed",
] as const;

export type ReportPageRow = Pick<
  Database["public"]["Tables"]["reimbursements"]["Row"],
  | "id"
  | "full_name"
  | "category"
  | "amount"
  | "status"
  | "merchant"
  | "submitted_at"
>;

export type ReportExportRow = ReportPageRow & Pick<
  Database["public"]["Tables"]["reimbursements"]["Row"],
  | "description"
  | "payment_method"
  | "receipt_date"
>;

export type ReportFilters = {
  from: string;
  to: string;
  category: string;
  member: string;
  minAmount: string;
  maxAmount: string;
  status: string;
};

type SearchValue = string | string[] | undefined;
type SearchParams = Record<string, SearchValue>;

const categoryValues = new Set<string>(categories.map(([value]) => value));
const statusValues = new Set<string>(reimbursementStatuses);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validDate(value: string) {
  if (!datePattern.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : "";
}

function validAmount(value: string) {
  const amount = Number(value);
  return value !== "" && Number.isFinite(amount) && amount >= 0 ? value : "";
}

export function parseReportFilters(params: SearchParams): ReportFilters {
  const category = first(params.category);
  const status = first(params.status);

  return {
    from: validDate(first(params.from)),
    to: validDate(first(params.to)),
    category: categoryValues.has(category) ? category : "",
    member: first(params.member).trim().slice(0, 120),
    minAmount: validAmount(first(params.minAmount)),
    maxAmount: validAmount(first(params.maxAmount)),
    status: statusValues.has(status) ? status : "",
  };
}

export function filtersToSearchParams(filters: ReportFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

function endExclusiveDate(value: string) {
  const end = new Date(`${value}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString();
}

export async function loadReportPageRows(
  supabase: SupabaseClient<Database>,
  filters: ReportFilters,
) {
  let query = supabase
    .from("reimbursements")
    .select("id, full_name, category, amount, status, merchant, submitted_at")
    .order("submitted_at", { ascending: false });

  if (filters.from) query = query.gte("submitted_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lt("submitted_at", endExclusiveDate(filters.to));
  if (filters.category) query = query.eq("category", filters.category as ReportPageRow["category"]);
  if (filters.member) query = query.eq("full_name", filters.member);
  if (filters.minAmount) query = query.gte("amount", Number(filters.minAmount));
  if (filters.maxAmount) query = query.lte("amount", Number(filters.maxAmount));
  if (filters.status) query = query.eq("status", filters.status as ReportPageRow["status"]);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load the reimbursement report: ${error.message}`);
  return data ?? [];
}

export async function loadReportExportRows(
  supabase: SupabaseClient<Database>,
  filters: ReportFilters,
) {
  const rows: ReportExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("reimbursements")
      .select("id, full_name, category, amount, status, merchant, description, payment_method, receipt_date, submitted_at")
      .order("submitted_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (filters.from) query = query.gte("submitted_at", `${filters.from}T00:00:00.000Z`);
    if (filters.to) query = query.lt("submitted_at", endExclusiveDate(filters.to));
    if (filters.category) query = query.eq("category", filters.category as ReportExportRow["category"]);
    if (filters.member) query = query.eq("full_name", filters.member);
    if (filters.minAmount) query = query.gte("amount", Number(filters.minAmount));
    if (filters.maxAmount) query = query.lte("amount", Number(filters.maxAmount));
    if (filters.status) query = query.eq("status", filters.status as ReportExportRow["status"]);

    const { data, error } = await query;
    if (error) throw new Error(`Unable to export the reimbursement report: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

export function summarizeApproved(rows: ReportPageRow[]) {
  const approved = rows.filter((row) => row.status === "approved");
  const categoryCents = Object.fromEntries(categories.map(([category]) => [category, 0])) as Record<string, number>;
  const monthCents = new Map<string, number>();

  for (const row of approved) {
    const cents = Math.round(Number(row.amount) * 100);
    categoryCents[row.category] += cents;
    const month = row.submitted_at.slice(0, 7);
    monthCents.set(month, (monthCents.get(month) ?? 0) + cents);
  }

  return {
    approvedCount: approved.length,
    approvedTotal: Object.values(categoryCents).reduce((total, cents) => total + cents, 0) / 100,
    byCategory: Object.fromEntries(Object.entries(categoryCents).map(([category, cents]) => [category, cents / 100])),
    byMonth: [...monthCents.entries()]
      .map(([month, cents]) => [month, cents / 100] as const)
      .sort(([left], [right]) => right.localeCompare(left)),
  };
}

function csvCell(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  const text = typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reportRowsToCsv(rows: ReportExportRow[]) {
  const headings = [
    "Submitted date",
    "Member",
    "Category",
    "Amount",
    "Status",
    "Merchant",
    "Description",
    "Payment method",
    "Receipt date",
    "Submission ID",
  ];
  const body = rows.map((row) => [
    row.submitted_at,
    row.full_name,
    row.category,
    Number(row.amount).toFixed(2),
    row.status,
    row.merchant,
    row.description,
    row.payment_method,
    row.receipt_date,
    row.id,
  ].map(csvCell).join(","));

  return `\uFEFF${[headings.join(","), ...body].join("\r\n")}\r\n`;
}

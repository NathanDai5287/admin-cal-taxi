import type { SupabaseClient } from "@supabase/supabase-js";

import { categories, formatCategory } from "@/lib/reimbursements/format";
import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

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
  | "description"
  | "receipt_date"
  | "submitted_at"
>;

export type ReportExportRow = ReportPageRow & Pick<
  Database["public"]["Tables"]["reimbursements"]["Row"],
  "payment_method"
>;

export type ManualExpenseRow = Database["public"]["Tables"]["reimbursement_manual_expenses"]["Row"];

export type ReportBreakdownItem = {
  id: string;
  source: "receipt" | "manual";
  description: string;
  amount: number;
  date: string;
};

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
  const { data, error } = await loadAllPages<ReportPageRow>((from, to) => {
    let query = supabase
      .from("reimbursements")
      .select("id, full_name, category, amount, status, merchant, description, receipt_date, submitted_at")
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false });
    if (filters.from) query = query.gte("submitted_at", `${filters.from}T00:00:00.000Z`);
    if (filters.to) query = query.lt("submitted_at", endExclusiveDate(filters.to));
    if (filters.category) query = query.eq("category", filters.category as ReportPageRow["category"]);
    if (filters.member) query = query.eq("full_name", filters.member);
    if (filters.minAmount) query = query.gte("amount", Number(filters.minAmount));
    if (filters.maxAmount) query = query.lte("amount", Number(filters.maxAmount));
    if (filters.status) query = query.eq("status", filters.status as ReportPageRow["status"]);
    return query.range(from, to);
  });
  if (error) throw new Error(`Unable to load the reimbursement report: ${error.message}`);
  return data ?? [];
}

export async function loadReportManualExpenses(
  supabase: SupabaseClient<Database>,
  filters: ReportFilters,
) {
  // Manual expenses are approved chapter spending without an associated
  // member. Member filters and non-approved status filters exclude them.
  if (filters.member || (filters.status && filters.status !== "approved")) {
    return [] as ManualExpenseRow[];
  }

  const { data, error } = await loadAllPages<ManualExpenseRow>((from, to) => {
    let query = supabase
      .from("reimbursement_manual_expenses")
      .select("id, category, amount, description, expense_date, receipt_path, created_by, created_at, updated_at")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (filters.from) query = query.gte("expense_date", filters.from);
    if (filters.to) query = query.lte("expense_date", filters.to);
    if (filters.category) query = query.eq("category", filters.category as ManualExpenseRow["category"]);
    if (filters.minAmount) query = query.gte("amount", Number(filters.minAmount));
    if (filters.maxAmount) query = query.lte("amount", Number(filters.maxAmount));
    return query.range(from, to);
  });
  if (error) throw new Error(`Unable to load manual expenses: ${error.message}`);
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

export function summarizeApproved(rows: ReportPageRow[], manualExpenses: ManualExpenseRow[] = []) {
  const approved = rows.filter((row) => row.status === "approved");
  const categoryCents = Object.fromEntries(categories.map(([category]) => [category, 0])) as Record<string, number>;
  const categoryItems = Object.fromEntries(categories.map(([category]) => [category, []])) as Record<string, ReportBreakdownItem[]>;
  const monthCents = new Map<string, number>();
  let receiptCents = 0;
  let manualCents = 0;

  for (const row of approved) {
    const cents = Math.round(Number(row.amount) * 100);
    categoryCents[row.category] += cents;
    receiptCents += cents;
    const date = row.receipt_date ?? row.submitted_at.slice(0, 10);
    categoryItems[row.category].push({
      id: row.id,
      source: "receipt",
      description: row.merchant || row.description,
      amount: cents / 100,
      date,
    });
    const month = date.slice(0, 7);
    monthCents.set(month, (monthCents.get(month) ?? 0) + cents);
  }

  for (const expense of manualExpenses) {
    const cents = Math.round(Number(expense.amount) * 100);
    categoryCents[expense.category] += cents;
    manualCents += cents;
    categoryItems[expense.category].push({
      id: expense.id,
      source: "manual",
      description: expense.description,
      amount: cents / 100,
      date: expense.expense_date,
    });
    const month = expense.expense_date.slice(0, 7);
    monthCents.set(month, (monthCents.get(month) ?? 0) + cents);
  }

  for (const items of Object.values(categoryItems)) {
    items.sort((left, right) => right.date.localeCompare(left.date));
  }

  return {
    approvedCount: approved.length,
    manualCount: manualExpenses.length,
    receiptTotal: receiptCents / 100,
    manualTotal: manualCents / 100,
    approvedTotal: Object.values(categoryCents).reduce((total, cents) => total + cents, 0) / 100,
    byCategory: Object.fromEntries(Object.entries(categoryCents).map(([category, cents]) => [category, cents / 100])),
    byCategoryItems: categoryItems,
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

export function reportRowsToCsv(rows: ReportExportRow[], manualExpenses: ManualExpenseRow[] = []) {
  const headings = [
    "Date",
    "Source",
    "Member",
    "Category",
    "Amount",
    "Status",
    "Merchant",
    "Description",
    "Zelle",
    "Receipt date",
    "Submission ID",
  ];
  const entries = [
    ...rows.map((row) => ({
      date: row.receipt_date ?? row.submitted_at,
      cells: [
        row.receipt_date ?? row.submitted_at,
        "receipt",
        row.full_name,
        formatCategory(row.category),
        Number(row.amount).toFixed(2),
        row.status,
        row.merchant,
        row.description,
        row.payment_method,
        row.receipt_date,
        row.id,
      ],
    })),
    ...manualExpenses.map((expense) => ({
      date: expense.expense_date,
      cells: [
        expense.expense_date,
        "manual",
        "",
        formatCategory(expense.category),
        Number(expense.amount).toFixed(2),
        "approved",
        "",
        expense.description,
        "",
        "",
        expense.id,
      ],
    })),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const body = entries.map(({ cells }) => cells.map(csvCell).join(","));

  return `\uFEFF${[headings.join(","), ...body].join("\r\n")}\r\n`;
}

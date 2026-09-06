"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { incomeSources } from "@/lib/reimbursements/financial-report";
import { categories } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const budgetKeys = categories.map(([value]) => value);
const incomeSourceValues = incomeSources.map(([value]) => value);
const amountSchema = z.preprocess(
  (value) => value === "" ? null : value,
  z.coerce.number().min(0).max(999_999_999.99).nullable(),
);
const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});

function budgetRedirectTarget(
  key: "entry" | "limits" | "settings" | "receivable",
  result: "added" | "deleted" | "saved" | "invalid" | "error",
) {
  const url = new URL("/reimbursements/budgets", "http://local");
  url.searchParams.set(key, result);
  return `${url.pathname}${url.search}`;
}

function revalidateBudgetPages() {
  revalidatePath("/reimbursements/budgets");
  revalidatePath("/reimbursements/reports");
}

export async function saveReimbursementBudgets(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = z.record(z.string(), amountSchema).safeParse(
    Object.fromEntries(budgetKeys.map((key) => [key, formData.get(key)])),
  );

  if (!parsed.success) redirect(budgetRedirectTarget("limits", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("reimbursement_budgets").upsert(
    budgetKeys.map((budgetKey) => ({
      budget_key: budgetKey,
      amount: parsed.data[budgetKey] ?? null,
      updated_by: userId,
    })),
    { onConflict: "budget_key" },
  );

  if (error) redirect(budgetRedirectTarget("limits", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("limits", "saved"));
}

const budgetEntrySchema = z.object({
  amount: z.coerce.number().positive().max(999_999_999.99),
  description: z.string().trim().min(1).max(500),
  source: z.enum(incomeSourceValues),
  budgetDate: dateSchema,
});

export async function addBudgetEntry(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = budgetEntrySchema.safeParse({
    amount: formData.get("amount"),
    description: formData.get("description"),
    source: formData.get("source"),
    budgetDate: formData.get("budgetDate"),
  });

  if (!parsed.success) redirect(budgetRedirectTarget("entry", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("reimbursement_budget_entries").insert({
    amount: parsed.data.amount,
    description: parsed.data.description,
    source: parsed.data.source,
    budget_date: parsed.data.budgetDate,
    created_by: userId,
  });

  if (error) redirect(budgetRedirectTarget("entry", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("entry", "added"));
}

export async function deleteBudgetEntry(formData: FormData) {
  await requireAdmin();
  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) redirect(budgetRedirectTarget("entry", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reimbursement_budget_entries")
    .delete()
    .eq("id", parsed.data);

  if (error) redirect(budgetRedirectTarget("entry", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("entry", "deleted"));
}

const financialSettingsSchema = z.object({
  chapterName: z.string().trim().min(1).max(120),
  termLabel: z.string().trim().min(1).max(120),
  termStart: dateSchema,
  termEnd: dateSchema,
  openingCash: z.coerce.number().min(0).max(999_999_999.99),
}).refine((value) => value.termEnd >= value.termStart, { path: ["termEnd"] });

export async function saveFinancialSettings(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = financialSettingsSchema.safeParse({
    chapterName: formData.get("chapterName"),
    termLabel: formData.get("termLabel"),
    termStart: formData.get("termStart"),
    termEnd: formData.get("termEnd"),
    openingCash: formData.get("openingCash"),
  });

  if (!parsed.success) redirect(budgetRedirectTarget("settings", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("chapter_financial_settings").upsert({
    id: true,
    chapter_name: parsed.data.chapterName,
    term_label: parsed.data.termLabel,
    term_start: parsed.data.termStart,
    term_end: parsed.data.termEnd,
    opening_cash: parsed.data.openingCash,
    updated_by: userId,
  });

  if (error) redirect(budgetRedirectTarget("settings", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("settings", "saved"));
}

const receivableSchema = z.object({
  memberName: z.string().trim().min(1).max(120),
  amountAssessed: z.coerce.number().positive().max(999_999_999.99),
  amountPaid: z.coerce.number().min(0).max(999_999_999.99),
  dueDate: dateSchema,
  notes: z.string().trim().max(500),
}).refine((value) => value.amountPaid <= value.amountAssessed, { path: ["amountPaid"] });

export async function addReceivable(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = receivableSchema.safeParse({
    memberName: formData.get("memberName"),
    amountAssessed: formData.get("amountAssessed"),
    amountPaid: formData.get("amountPaid"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) redirect(budgetRedirectTarget("receivable", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("chapter_receivables").insert({
    member_name: parsed.data.memberName,
    amount_assessed: parsed.data.amountAssessed,
    amount_paid: parsed.data.amountPaid,
    due_date: parsed.data.dueDate,
    notes: parsed.data.notes,
    created_by: userId,
  });

  if (error) redirect(budgetRedirectTarget("receivable", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("receivable", "added"));
}

export async function updateReceivablePaid(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    id: z.string().uuid(),
    amountAssessed: z.coerce.number().positive(),
    amountPaid: z.coerce.number().min(0),
  }).refine((value) => value.amountPaid <= value.amountAssessed).safeParse({
    id: formData.get("id"),
    amountAssessed: formData.get("amountAssessed"),
    amountPaid: formData.get("amountPaid"),
  });

  if (!parsed.success) redirect(budgetRedirectTarget("receivable", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("chapter_receivables")
    .update({ amount_paid: parsed.data.amountPaid })
    .eq("id", parsed.data.id);

  if (error) redirect(budgetRedirectTarget("receivable", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("receivable", "saved"));
}

export async function deleteReceivable(formData: FormData) {
  await requireAdmin();
  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) redirect(budgetRedirectTarget("receivable", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("chapter_receivables").delete().eq("id", parsed.data);

  if (error) redirect(budgetRedirectTarget("receivable", "error"));
  revalidateBudgetPages();
  redirect(budgetRedirectTarget("receivable", "deleted"));
}

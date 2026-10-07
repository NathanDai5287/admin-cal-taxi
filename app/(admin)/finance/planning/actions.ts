"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categories, categorySchema, type ReimbursementCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const budgetKeys = categories.map(([value]) => value);
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
  key: "entry" | "limits",
  result: "added" | "deleted" | "saved" | "invalid" | "error",
) {
  const url = new URL("/finance/planning", "http://local");
  url.searchParams.set(key, result);
  return `${url.pathname}${url.search}`;
}

function revalidateBudgetPages() {
  revalidatePath("/finance/planning");
  revalidatePath("/finance/reports");
}

export type ExpensePlanState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function saveReimbursementBudgets(
  _previousState: ExpensePlanState,
  formData: FormData,
): Promise<ExpensePlanState> {
  const { userId } = await requireAdmin();
  const parsed = z.record(z.string(), amountSchema).safeParse(
    Object.fromEntries(budgetKeys.map((key) => [key, formData.get(key)])),
  );

  if (!parsed.success) return { status: "error", message: "Enter valid non-negative amounts." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("reimbursement_budgets").upsert({
    id: true,
    category_amounts: parsed.data,
    updated_by: userId,
  }, { onConflict: "id" });

  if (error) return { status: "error", message: "The expense plan could not be saved." };
  revalidateBudgetPages();
  return { status: "success", message: "Expense plan saved." };
}

export async function setExpenseCategoryCompleted(category: ReimbursementCategory, completed: boolean): Promise<ExpensePlanState> {
  const { userId } = await requireAdmin();
  const parsed = z.object({ category: categorySchema, completed: z.boolean() }).safeParse({ category, completed });
  if (!parsed.success) return { status: "error", message: "Choose a valid category." };

  const supabase = createAdminClient();
  const maximumAttempts = 3;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const { data, error: readError } = await supabase.from("reimbursement_budgets").select("completed_categories, updated_at").eq("id", true).single();
    if (readError) return { status: "error", message: "Could not save this category. Try again." };
    const completedCategories = data.completed_categories.filter((value) => value !== category);
    if (completed) completedCategories.push(category);
    const { data: saved, error } = await supabase.from("reimbursement_budgets").update({ completed_categories: completedCategories, updated_by: userId }).eq("id", true).eq("updated_at", data.updated_at).select("id");
    if (error) return { status: "error", message: "Could not save this category. Try again." };
    if (saved.length) return { status: "success", message: "Category saved." };
  }
  return { status: "error", message: "The plan changed during saving. Try again." };
}

const budgetEntrySchema = z.object({
  amount: z.coerce.number().positive().max(999_999_999.99),
  description: z.string().trim().min(1).max(500),
  budgetDate: dateSchema,
});

export async function addBudgetEntry(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = budgetEntrySchema.safeParse({
    amount: formData.get("amount"),
    description: formData.get("description"),
    budgetDate: formData.get("budgetDate"),
  });

  if (!parsed.success) redirect(budgetRedirectTarget("entry", "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("reimbursement_budget_entries").insert({
    kind: "forecast",
    amount: parsed.data.amount,
    description: parsed.data.description,
    source: "alumni_donations",
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
  if (!parsed.success) return { ok: false, message: "Choose a valid forecast." } as const;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reimbursement_budget_entries")
    .delete()
    .eq("id", parsed.data)
    .eq("kind", "forecast");

  if (error) return { ok: false, message: "The forecast could not be removed." } as const;
  revalidateBudgetPages();
  return { ok: true } as const;
}

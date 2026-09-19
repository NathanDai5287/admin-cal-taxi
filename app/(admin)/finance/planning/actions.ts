"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categories } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import type { Database } from "@/lib/reimbursements/supabase/database.types";

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
  const { error: categoryMapError } = await supabase.from("reimbursement_budgets").upsert({
    id: true,
    category_amounts: parsed.data,
    updated_by: userId,
  }, { onConflict: "id" });

  let error = categoryMapError;
  if (categoryMapError?.code === "PGRST204" || categoryMapError?.code === "42703") {
    const legacyRows = budgetKeys.map((budgetKey) => ({
      budget_key: budgetKey,
      amount: parsed.data[budgetKey] ?? null,
      updated_by: userId,
    })) as unknown as Database["public"]["Tables"]["reimbursement_budgets"]["Insert"][];
    error = (await supabase.from("reimbursement_budgets").upsert(
      legacyRows,
      { onConflict: "budget_key" },
    )).error;
  }

  if (error) return { status: "error", message: "The expense plan could not be saved." };
  revalidateBudgetPages();
  return { status: "success", message: "Expense plan saved." };
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

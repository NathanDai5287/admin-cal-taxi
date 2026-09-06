"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categoryValues } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

function reportRedirectTarget(
  formData: FormData,
  result: "added" | "deleted" | "invalid" | "error",
) {
  const requested = formData.get("returnTo");
  const fallback = "/reimbursements/reports";
  const target = typeof requested === "string" && requested.startsWith(`${fallback}?`)
    ? requested
    : fallback;
  const url = new URL(target, "http://local");
  url.searchParams.set("manual", result);
  return `${url.pathname}${url.search}`;
}

const manualExpenseSchema = z.object({
  category: z.enum(categoryValues),
  amount: z.coerce.number().positive().max(999_999_999.99),
  description: z.string().trim().min(1).max(500),
  expenseDate: z.string().refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }),
});

export async function addManualExpense(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = manualExpenseSchema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    expenseDate: formData.get("expenseDate"),
  });

  if (!parsed.success) redirect(reportRedirectTarget(formData, "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("reimbursement_manual_expenses").insert({
    category: parsed.data.category,
    amount: parsed.data.amount,
    description: parsed.data.description,
    expense_date: parsed.data.expenseDate,
    created_by: userId,
  });

  if (error) redirect(reportRedirectTarget(formData, "error"));
  revalidatePath("/reimbursements/reports");
  revalidatePath("/reimbursements/budgets");
  redirect(reportRedirectTarget(formData, "added"));
}

export async function deleteManualExpense(formData: FormData) {
  await requireAdmin();
  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) redirect(reportRedirectTarget(formData, "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reimbursement_manual_expenses")
    .delete()
    .eq("id", parsed.data);

  if (error) redirect(reportRedirectTarget(formData, "error"));
  revalidatePath("/reimbursements/reports");
  revalidatePath("/reimbursements/budgets");
  redirect(reportRedirectTarget(formData, "deleted"));
}

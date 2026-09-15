"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categoryValues } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

function reportRedirectTarget(_formData: FormData, result: "added" | "deleted" | "invalid" | "error" | "receipt") {
  return `/finance/accounts/activity?manual=${result}`;
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
  let receiptPath: string | null = null;
  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.name) {
    if (receipt.size === 0 || receipt.size > 3 * 1024 * 1024) redirect(reportRedirectTarget(formData, "receipt"));
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
    if (!jpeg && !png) redirect(reportRedirectTarget(formData, "receipt"));
    receiptPath = `manual/${userId}/${crypto.randomUUID()}.${jpeg ? "jpg" : "png"}`;
    const { error: uploadError } = await supabase.storage.from("receipts").upload(receiptPath, bytes, { contentType: jpeg ? "image/jpeg" : "image/png" });
    if (uploadError) redirect(reportRedirectTarget(formData, "error"));
  }
  const { error } = await supabase.from("reimbursement_manual_expenses").insert({
    receipt_path: receiptPath,
    category: parsed.data.category,
    amount: parsed.data.amount,
    description: parsed.data.description,
    expense_date: parsed.data.expenseDate,
    created_by: userId,
  });

  if (error) {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    redirect(reportRedirectTarget(formData, "error"));
  }
  revalidatePath("/finance/accounts/activity");
  revalidatePath("/finance/accounts");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/planning");
  redirect(reportRedirectTarget(formData, "added"));
}

export async function deleteManualExpense(formData: FormData) {
  await requireAdmin();
  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { ok: false, message: "Choose a valid expense." } as const;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reimbursement_manual_expenses")
    .delete()
    .eq("id", parsed.data)
    .select("receipt_path")
    .maybeSingle();

  if (error) return { ok: false, message: "The expense could not be removed." } as const;
  revalidatePath("/finance/accounts/activity");
  revalidatePath("/finance/accounts");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/planning");
  if (data?.receipt_path) await supabase.storage.from("receipts").remove([data.receipt_path]);
  return { ok: true } as const;
}

const incomeSchema = z.object({
  amount: z.coerce.number().positive().max(999_999_999.99),
  description: z.string().trim().min(1).max(500),
  source: z.enum(["active_member_dues", "new_member_fees", "fundraising", "alumni_donations", "other"]),
  budgetDate: manualExpenseSchema.shape.expenseDate,
});

export async function addIncomeEntry(formData: FormData) {
  const { userId } = await requireAdmin();
  const parsed = incomeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/finance/accounts/activity?entry=invalid");
  const { error } = await createAdminClient().from("reimbursement_budget_entries").insert({
    kind: "income", amount: parsed.data.amount, description: parsed.data.description,
    source: parsed.data.source, budget_date: parsed.data.budgetDate, created_by: userId,
  });
  if (error) redirect("/finance/accounts/activity?entry=error");
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/accounts");
  redirect("/finance/accounts/activity?entry=added");
}

export async function deleteIncomeEntry(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Choose a valid income entry." } as const;
  const { error } = await createAdminClient().from("reimbursement_budget_entries").delete().eq("id", id.data).eq("kind", "income");
  if (error) return { ok: false, message: "The income entry could not be removed." } as const;
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/accounts");
  return { ok: true } as const;
}

export async function saveOpeningCash(formData: FormData) {
  const { userId } = await requireAdmin();
  const amount = z.coerce.number().min(0).max(999_999_999.99).safeParse(formData.get("openingCash"));
  if (!amount.success) redirect("/finance/accounts/activity?settings=invalid");
  const { error } = await createAdminClient().from("chapter_financial_settings")
    .update({ opening_cash: amount.data, updated_by: userId }).eq("id", true).select("id").single();
  if (error) redirect("/finance/accounts/activity?settings=error");
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/accounts");
  redirect("/finance/accounts/activity?settings=saved");
}

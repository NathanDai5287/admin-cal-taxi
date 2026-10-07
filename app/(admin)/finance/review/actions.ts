"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categorySchema, categoryValues, type ReimbursementCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { setExpenseCategoryCompleted } from "@/app/(admin)/finance/planning/actions";

type ReimbursementStatus = "approved" | "denied";

export type StatusMutationResult =
  | { ok: true; row: { id: string; status: ReimbursementStatus; updated_at: string } }
  | { ok: false; message: string; completedCategory?: ReimbursementCategory };

export async function setReimbursementStatus(
  id: string,
  status: string,
  denialReason?: string,
  reopenCategory?: ReimbursementCategory,
): Promise<StatusMutationResult> {
  await requireAdmin();

  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["approved", "denied"]),
    denialReason: z.string().trim().max(500).optional(),
    reopenCategory: categorySchema.optional(),
  }).safeParse({ id, status, denialReason, reopenCategory });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid reimbursement status." };
  }

  const supabase = createAdminClient();
  const reopening = parsed.data.status === "approved" ? parsed.data.reopenCategory : undefined;
  if (reopening) {
    const { data: submission, error: lookupError } = await supabase.from("reimbursements")
      .select("category, status, reimbursed").eq("id", parsed.data.id).maybeSingle();
    if (lookupError) return { ok: false, message: "Could not check this reimbursement. Try again." };
    if (!submission || submission.category !== reopening || submission.reimbursed || submission.status === "pending") {
      return { ok: false, message: "This reimbursement changed. Review it before approving." };
    }
    const reopened = await setExpenseCategoryCompleted(reopening, false);
    if (reopened.status === "error") return { ok: false, message: reopened.message };
    revalidatePath("/finance/planning");
  }
  let mutation = supabase
    .from("reimbursements")
    .update({
      status: parsed.data.status,
      denial_reason: parsed.data.status === "denied" ? parsed.data.denialReason || null : null,
    })
    .eq("id", parsed.data.id)
    .eq("reimbursed", false)
    .neq("status", "pending");
  if (reopening) mutation = mutation.eq("category", reopening);
  const { data, error } = await mutation
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23514" && error.message === "Reopen the completed category before approving this reimbursement") {
      const category = categorySchema.parse(error.details);
      return { ok: false, completedCategory: category, message: reopening ? "The category reopened, but approval failed because it was completed again." : "Reopen this category before approving." };
    }
    return { ok: false, message: `${reopening ? "The category reopened, but approval failed. " : ""}Unable to change the status: ${error.message}` };
  }
  if (!data) {
    return { ok: false, message: `${reopening ? "The category reopened, but approval failed. " : ""}That reimbursement is paid, changed, still processing, or no longer exists.` };
  }

  revalidatePath("/finance", "layout");
  revalidatePath("/finance/reports");
  revalidatePath(`/finance/review/${parsed.data.id}`);
  return {
    ok: true,
    row: { id: data.id, status: parsed.data.status, updated_at: data.updated_at },
  };
}

export async function updateStatus(formData: FormData) {
  const denialReason = formData.get("denialReason");
  const result = await setReimbursementStatus(
    String(formData.get("id") ?? ""),
    String(formData.get("status") ?? ""),
    typeof denialReason === "string" ? denialReason : undefined,
  );
  if (!result.ok) throw new Error(result.message);
}

export async function updateMerchant(formData: FormData) {
  await requireAdmin();

  const parsed = z.object({
    id: z.uuid(),
    merchant: z.string().trim().min(1).max(200),
  }).safeParse({ id: formData.get("id"), merchant: formData.get("merchant") });
  if (!parsed.success) {
    throw new Error("Enter a valid expense name.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reimbursements")
    .update({ merchant: parsed.data.merchant })
    .eq("id", parsed.data.id);
  if (error) {
    throw new Error("Unable to rename the expense. Please try again.");
  }

  revalidatePath("/finance", "layout");
  revalidatePath(`/finance/review/${parsed.data.id}`);
}

export async function updateCategory(formData: FormData) {
  await requireAdmin();

  const parsed = z.object({
    id: z.uuid(),
    category: z.enum(categoryValues),
  }).safeParse({ id: formData.get("id"), category: formData.get("category") });
  if (!parsed.success) {
    throw new Error("Choose a valid reimbursement category.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reimbursements")
    .update({ category: parsed.data.category })
    .eq("id", parsed.data.id);
  if (error) {
    if (error.code === "23514" && error.message === "Reopen the completed category before approving this reimbursement") {
      throw new Error("Reopen the category in Planning before moving this approved reimbursement.");
    }
    throw new Error("Unable to change the category. Please try again.");
  }

  revalidatePath("/finance", "layout");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/planning");
  revalidatePath(`/finance/review/${parsed.data.id}`);
}

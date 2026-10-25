"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin, requireAppAccess } from "@/lib/reimbursements/auth";
import { categorySchema, categoryValues, type ReimbursementCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import type { EmailFailure } from "@/lib/email-send";
import { sendDecisionEmail } from "@/lib/reimbursements/send-reimbursement-email";
import { setExpenseCategoryCompleted } from "@/app/(admin)/finance/planning/actions";

export type ReviewDecision = { status: "approved" | "denied"; note: string; amount?: number };

type DecidedRow = { id: string; status: ReviewDecision["status"]; amount: number; requested_amount: number | null; updated_at: string };

export type StatusMutationResult =
  | { ok: true; row: DecidedRow; emailFailure?: EmailFailure }
  | { ok: false; message: string; completedCategory?: ReimbursementCategory };

export async function setReimbursementStatus(
  id: string,
  decision: ReviewDecision,
  reopenCategory?: ReimbursementCategory,
): Promise<StatusMutationResult> {
  await requireAdmin("/");

  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["approved", "denied"]),
    note: z.string().trim().max(500),
    amount: z.number().positive().max(99_999_999.99).multipleOf(0.01).optional(),
    reopenCategory: categorySchema.optional(),
  }).safeParse({ id, ...decision, reopenCategory });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid decision and amount." };
  }

  const approving = parsed.data.status === "approved";
  if (!approving && !parsed.data.note) {
    return { ok: false, message: "Write a reason for the denial." };
  }

  const supabase = createAdminClient();
  const { data: submission, error: lookupError } = await supabase.from("reimbursements")
    .select("category, status, reimbursed, amount, requested_amount").eq("id", parsed.data.id).maybeSingle();
  if (lookupError) return { ok: false, message: "Could not check this reimbursement. Try again." };
  if (!submission) return { ok: false, message: "That reimbursement no longer exists." };

  const reopening = approving ? parsed.data.reopenCategory : undefined;
  if (reopening) {
    if (submission.category !== reopening || submission.reimbursed || submission.status === "pending") {
      return { ok: false, message: "This reimbursement changed. Review it before approving." };
    }
    const reopened = await setExpenseCategoryCompleted(reopening, false);
    if (reopened.status === "error") return { ok: false, message: reopened.message };
    revalidatePath("/finance/planning");
  }
  const requestedAmount = submission.requested_amount ?? submission.amount;
  const amount = approving ? parsed.data.amount ?? submission.amount : submission.amount;
  let mutation = supabase
    .from("reimbursements")
    .update({
      status: parsed.data.status,
      denial_reason: approving ? null : parsed.data.note || null,
      approval_note: approving ? parsed.data.note || null : null,
      amount,
      requested_amount: Number(amount) === Number(requestedAmount) ? null : requestedAmount,
    })
    .eq("id", parsed.data.id)
    .eq("reimbursed", false)
    .neq("status", "pending");
  if (reopening) mutation = mutation.eq("category", reopening);
  const { data, error } = await mutation
    .select("id, amount, requested_amount, updated_at")
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

  const email = await sendDecisionEmail(data.id);
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/reports");
  revalidatePath(`/finance/review/${parsed.data.id}`);
  return { ok: true, row: { ...data, status: parsed.data.status }, ...(email?.sent === false ? { emailFailure: email } : {}) };
}

export async function updateDescription(formData: FormData) {
  await requireAppAccess("finance", "write");

  const parsed = z.object({
    id: z.uuid(),
    description: z.string().trim().min(1).max(2000),
  }).safeParse({ id: formData.get("id"), description: formData.get("description") });
  if (!parsed.success) {
    throw new Error("Enter a description.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reimbursements")
    .update({ description: parsed.data.description })
    .eq("id", parsed.data.id);
  if (error) {
    throw new Error("Unable to save the description. Please try again.");
  }

  revalidatePath("/finance", "layout");
  revalidatePath(`/finance/review/${parsed.data.id}`);
}

export async function updateCategory(formData: FormData) {
  await requireAdmin("/");

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

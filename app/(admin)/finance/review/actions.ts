"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categoryValues } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

type ReimbursementStatus = "approved" | "denied";

export type StatusMutationResult =
  | { ok: true; row: { id: string; status: ReimbursementStatus; updated_at: string } }
  | { ok: false; message: string };

export async function setReimbursementStatus(
  id: string,
  status: string,
  denialReason?: string,
): Promise<StatusMutationResult> {
  await requireAdmin();

  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["approved", "denied"]),
    denialReason: z.string().trim().max(500).optional(),
  }).safeParse({ id, status, denialReason });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid reimbursement status." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reimbursements")
    .update({
      status: parsed.data.status,
      denial_reason: parsed.data.status === "denied" ? parsed.data.denialReason || null : null,
    })
    .eq("id", parsed.data.id)
    .eq("reimbursed", false)
    .neq("status", "pending")
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Unable to change the status: ${error.message}` };
  }
  if (!data) {
    return { ok: false, message: "That reimbursement is paid, still processing, or no longer exists." };
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
    throw new Error("Unable to change the category. Please try again.");
  }

  revalidatePath("/finance", "layout");
  revalidatePath("/finance/reports");
  revalidatePath("/finance/planning");
  revalidatePath(`/finance/review/${parsed.data.id}`);
}

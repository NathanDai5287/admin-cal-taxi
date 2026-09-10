"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categoryValues } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export async function updateStatus(formData: FormData) {
  await requireAdmin();

  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["approved", "denied"]),
  }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;

  const supabase = createAdminClient();
  await supabase.from("reimbursements").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/reimbursements");
  revalidatePath("/reimbursements/reports");
  revalidatePath(`/reimbursements/${parsed.data.id}`);
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

  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/${parsed.data.id}`);
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

  revalidatePath("/reimbursements");
  revalidatePath("/reimbursements/reports");
  revalidatePath("/reimbursements/budgets");
  revalidatePath(`/reimbursements/${parsed.data.id}`);
}

export async function updateReimbursed(formData: FormData) {
  await requireAdmin();

  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) return;

  const reimbursed = formData.get("reimbursed") === "true";
  const supabase = createAdminClient();
  await supabase.from("reimbursements").update({ reimbursed }).eq("id", parsed.data.id);
  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/${parsed.data.id}`);
}

export type BulkReimbursementResult =
  | { ok: true; skippedIds: string[]; updatedIds: string[] }
  | { ok: false; message: string };

export async function markReimbursementsPaid(
  reimbursementIds: string[],
): Promise<BulkReimbursementResult> {
  await requireAdmin();

  const parsed = z.array(z.uuid()).min(1).safeParse(reimbursementIds);

  if (!parsed.success) {
    return { ok: false, message: "Choose at least one valid reimbursement." };
  }

  const ids = [...new Set(parsed.data)];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reimbursements")
    .update({ reimbursed: true })
    .in("id", ids)
    .eq("status", "approved")
    .eq("reimbursed", false)
    .select("id");

  if (error) {
    return { ok: false, message: `Unable to mark reimbursements as paid: ${error.message}` };
  }

  const updatedIds = (data ?? []).map((row) => row.id);
  const updatedIdSet = new Set(updatedIds);
  const skippedIds = ids.filter((id) => !updatedIdSet.has(id));

  revalidatePath("/reimbursements");
  return { ok: true, skippedIds, updatedIds };
}

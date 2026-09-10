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

export type ReimbursedMutationResult =
  | { ok: true; row: { id: string; reimbursed: boolean; updated_at: string } }
  | { ok: false; message: string };

export async function setReimbursementStatus(
  id: string,
  status: string,
): Promise<StatusMutationResult> {
  await requireAdmin();

  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["approved", "denied"]),
  }).safeParse({ id, status });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid reimbursement status." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reimbursements")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Unable to change the status: ${error.message}` };
  }
  if (!data) {
    return { ok: false, message: "That reimbursement no longer exists." };
  }

  revalidatePath("/reimbursements");
  revalidatePath("/reimbursements/reports");
  revalidatePath(`/reimbursements/${parsed.data.id}`);
  return {
    ok: true,
    row: { id: data.id, status: parsed.data.status, updated_at: data.updated_at },
  };
}

export async function updateStatus(formData: FormData) {
  await setReimbursementStatus(
    String(formData.get("id") ?? ""),
    String(formData.get("status") ?? ""),
  );
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
  await setReimbursementPaid(
    String(formData.get("id") ?? ""),
    formData.get("reimbursed") === "true",
  );
}

export async function setReimbursementPaid(
  id: string,
  reimbursed: boolean,
): Promise<ReimbursedMutationResult> {
  await requireAdmin();

  const parsed = z.object({ id: z.uuid(), reimbursed: z.boolean() }).safeParse({ id, reimbursed });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid reimbursement." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reimbursements")
    .update({ reimbursed: parsed.data.reimbursed })
    .eq("id", parsed.data.id)
    .select("id, reimbursed, updated_at")
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Unable to change the reimbursement payment state: ${error.message}` };
  }
  if (!data) {
    return { ok: false, message: "That reimbursement no longer exists." };
  }

  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/${parsed.data.id}`);
  revalidatePath("/reimbursements/reports");
  return { ok: true, row: data };
}

export type BulkReimbursementResult =
  | {
      ok: true;
      skippedIds: string[];
      updatedRows: Array<{ id: string; reimbursed: boolean; updated_at: string }>;
    }
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
    .select("id, reimbursed, updated_at");

  if (error) {
    return { ok: false, message: `Unable to mark reimbursements as paid: ${error.message}` };
  }

  const updatedRows = data ?? [];
  const updatedIds = updatedRows.map((row) => row.id);
  const updatedIdSet = new Set(updatedIds);
  const skippedIds = ids.filter((id) => !updatedIdSet.has(id));

  revalidatePath("/reimbursements");
  revalidatePath("/reimbursements/reports");
  return { ok: true, skippedIds, updatedRows };
}

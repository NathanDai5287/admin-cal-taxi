"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export async function updateStatus(formData: FormData) {
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

export async function updateReimbursed(formData: FormData) {
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

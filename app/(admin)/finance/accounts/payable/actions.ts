"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export type ReimbursedMutationResult =
  | { ok: true; row: { id: string; reimbursed: boolean; updated_at: string } }
  | { ok: false; message: string };

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
    .eq("status", "approved")
    .select("id, reimbursed, updated_at")
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Unable to change the reimbursement payment state: ${error.message}` };
  }
  if (!data) {
    return { ok: false, message: "Only approved reimbursements can have payments recorded." };
  }

  revalidatePath("/finance", "layout");
  revalidatePath(`/finance/review/${parsed.data.id}`);
  revalidatePath("/finance/reports");
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

  revalidatePath("/finance", "layout");
  revalidatePath("/finance/reports");
  return { ok: true, skippedIds, updatedRows };
}

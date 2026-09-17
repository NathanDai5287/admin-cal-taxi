"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMember } from "@/lib/reimbursements/auth";
import { reimbursementSchema } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { processReimbursementReceipt } from "@/lib/reimbursements/tabscanner";

const RECEIPT_EXTENSIONS = ["jpg", "png"] as const;

export type PrepareUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; message: string };

export async function prepareReceiptUpload(
  extension: string,
): Promise<PrepareUploadResult> {
  await requireMember();

  const parsed = z.enum(RECEIPT_EXTENSIONS).safeParse(extension);
  if (!parsed.success) {
    return { ok: false, message: "Receipt must be a JPG or PNG image." };
  }

  const supabase = createAdminClient();
  const path = `${crypto.randomUUID()}.${parsed.data}`;
  const { data, error } = await supabase.storage
    .from("receipts")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return { ok: false, message: "The receipt upload could not be prepared. Try again." };
  }

  return { ok: true, path: data.path, token: data.token };
}

export type SubmitResult =
  | { ok: true; message: string; reimbursementId?: string }
  | { ok: false; message: string };

export async function submitReimbursement(formData: FormData): Promise<SubmitResult> {
  const { userId, profile } = await requireMember();

  const parsed = reimbursementSchema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    paymentMethod: formData.get("paymentMethod"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form fields." };
  }

  const submitterName = z.string().trim().min(1).max(120).safeParse(profile.full_name);
  if (!submitterName.success) {
    return { ok: false, message: "Your Google account name is unavailable. Sign out and sign in again." };
  }

  const receiptPath = formData.get("receiptPath");
  const pathParsed = z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/)
    .safeParse(receiptPath);
  if (!pathParsed.success) {
    return { ok: false, message: "Upload the receipt image before submitting." };
  }

  const supabase = createAdminClient();

  // Confirm the browser actually uploaded the receipt to the signed path.
  const { data: stored } = await supabase.storage
    .from("receipts")
    .list("", { limit: 1, search: pathParsed.data });
  if (!stored?.some((object) => object.name === pathParsed.data)) {
    return { ok: false, message: "The receipt upload did not finish. Try submitting again." };
  }

  const { data: reimbursement, error: insertError } = await supabase
    .from("reimbursements")
    .insert({
      user_id: userId,
      full_name: submitterName.data,
      category: parsed.data.category,
      amount: parsed.data.amount,
      description: parsed.data.description,
      payment_method: parsed.data.paymentMethod,
      receipt_path: pathParsed.data,
    })
    .select("id")
    .single();

  if (insertError || !reimbursement) {
    return { ok: false, message: "Unable to submit the reimbursement. Try again." };
  }

  after(() => processReimbursementReceipt(reimbursement.id));
  revalidatePath("/submit/history");
  revalidatePath("/finance/review");
  return { ok: true, reimbursementId: reimbursement.id, message: "Submitted. We’re checking the receipt now." };
}

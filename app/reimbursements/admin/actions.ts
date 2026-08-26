"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export type InviteState = { message: string; ok: boolean };

export async function inviteMember(
  _previousState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireAdmin();
  const parsed = z.object({
    email: z.email(),
    fullName: z.string().trim().min(1).max(120),
  }).safeParse({ email: formData.get("email"), fullName: formData.get("fullName") });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Check the invitation.", ok: false };
  }

  try {
    const admin = createAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const redirectTo = new URL("/reimbursements/auth/callback", siteUrl);
    redirectTo.searchParams.set("next", "/reimbursements/auth/set-password");
    const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { full_name: parsed.data.fullName },
      redirectTo: redirectTo.toString(),
    });
    if (error) return { message: error.message, ok: false };
    return { message: `Invitation sent to ${parsed.data.email}.`, ok: true };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Unable to send invitation.", ok: false };
  }
}

export async function updateStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["pending", "verified", "approved", "denied"]),
  }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;

  await supabase.from("reimbursements").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/reimbursements/admin");
  revalidatePath("/reimbursements/dashboard");
}

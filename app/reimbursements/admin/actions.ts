"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export type InviteState = { message: string; ok: boolean };

async function inviteUser(
  role: "member" | "admin",
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
    const redirectTo = new URL("/reimbursements/auth/accept-invite", siteUrl);
    const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { full_name: parsed.data.fullName },
      redirectTo: redirectTo.toString(),
    });
    if (error) return { message: error.message, ok: false };

    const invitedUserId = data.user?.id;
    if (!invitedUserId) {
      return { message: "The invitation was sent, but the new account could not be configured.", ok: false };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", invitedUserId)
      .select("id")
      .single();

    if (profileError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(invitedUserId);
      const cleanupMessage = cleanupError
        ? " Contact the site operator to remove the partially created account."
        : " The partially created account was removed; you can try again.";
      return { message: `Unable to assign the ${role} role.${cleanupMessage}`, ok: false };
    }

    revalidatePath("/reimbursements/admin");
    return {
      message: `${role === "admin" ? "Admin invitation" : "Invitation"} sent to ${parsed.data.email}.`,
      ok: true,
    };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Unable to send invitation.", ok: false };
  }
}

export async function inviteMember(previousState: InviteState, formData: FormData) {
  return inviteUser("member", previousState, formData);
}

export async function inviteAdmin(previousState: InviteState, formData: FormData) {
  return inviteUser("admin", previousState, formData);
}

export async function promoteMember(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", parsed.data.id)
    .eq("role", "member");

  if (error) throw new Error(`Unable to promote member: ${error.message}`);
  revalidatePath("/reimbursements/admin");
}

export async function updateStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["approved", "denied"]),
  }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;

  await supabase.from("reimbursements").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/reimbursements/admin");
  revalidatePath(`/reimbursements/admin/${parsed.data.id}`);
  revalidatePath("/reimbursements/dashboard");
}

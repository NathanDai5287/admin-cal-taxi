"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { command, sendInvitations } from "@/lib/alumni-connect/server";
import type { ConnectResult } from "@/lib/alumni-connect/model";
export async function seedAlumniInvitations(
  input: unknown,
): Promise<ConnectResult> {
  const session = await requireAppAccess("users", "write");
  try {
    const result = await sendInvitations(session.userId, input, true);
    revalidatePath("/users/alumni");
    return result;
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof z.ZodError
          ? error.issues[0].message
          : error instanceof Error
            ? error.message
            : "Unable to process invitations.",
    };
  }
}
export async function revokeAlumniInvitation(form: FormData) {
  await requireAppAccess("users", "write");
  await command("revoke", { id: z.uuid().parse(form.get("id")) });
  revalidatePath("/users/alumni");
}
export async function removeAlumniSubscription(form: FormData) {
  await requireAppAccess("users", "write");
  await command("block", { id: z.uuid().parse(form.get("id")) });
  revalidatePath("/users/alumni");
}

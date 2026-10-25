"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resendTrackedEmail } from "@/lib/email-send";
import { loadUnsentEmail } from "@/lib/email-tracking";
import { requireAdmin, requireAppAccess } from "@/lib/reimbursements/auth";

export async function resendEmail(messageId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = z.uuid().safeParse(messageId);
  if (!parsed.success) return { ok: false, message: "Choose a valid email." };
  const message = await loadUnsentEmail(parsed.data);
  if (!message) return { ok: false, message: "That email no longer exists." };
  if (message.kind === "hosting") return { ok: false, message: "Send hosting emails again from the order page." };
  if (message.kind === "reimbursement") await requireAdmin("/");
  else await requireAppAccess("users", "write");

  const result = await resendTrackedEmail(message.id);
  revalidatePath("/finance", "layout");
  revalidatePath("/users");
  return result.sent ? { ok: true } : { ok: false, message: `The email was not sent: ${result.error}` };
}

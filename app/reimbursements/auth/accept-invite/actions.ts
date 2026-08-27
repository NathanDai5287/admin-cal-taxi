"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/reimbursements/supabase/server";

export async function acceptInvitation(formData: FormData) {
  const parsed = z.object({ tokenHash: z.string().min(1) }).safeParse({
    tokenHash: formData.get("tokenHash"),
  });

  if (!parsed.success) {
    redirect("/reimbursements/login?error=invalid_invite");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.tokenHash,
    type: "invite",
  });

  if (error) {
    redirect("/reimbursements/login?error=expired_invite");
  }

  redirect("/reimbursements/auth/set-password");
}

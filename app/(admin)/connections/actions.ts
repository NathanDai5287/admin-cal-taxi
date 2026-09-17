"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";

export async function revokeConnection(formData: FormData) {
  await requireAdmin("/");
  const parsed = z.string().uuid().safeParse(formData.get("clientId"));
  if (!parsed.success) redirect("/connections?result=invalid");
  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: parsed.data });
  if (error) redirect("/connections?result=error");
  revalidatePath("/connections");
  redirect("/connections?result=revoked");
}

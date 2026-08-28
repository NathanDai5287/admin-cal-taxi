import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/reimbursements/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    redirect("/reimbursements/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (!profile) {
    redirect("/reimbursements/login");
  }

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return { supabase, userId, profile, email };
}

export async function requireAdmin() {
  const context = await requireUser();
  if (context.profile.role !== "admin") {
    redirect("/reimbursements/dashboard");
  }
  return context;
}

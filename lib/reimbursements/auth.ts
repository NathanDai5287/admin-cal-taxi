import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/reimbursements/supabase/server";

export async function requireIdentity() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    redirect("/reimbursements/login");
  }

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";

  return { supabase, userId, email };
}

export async function requireUser() {
  const identity = await requireIdentity();
  const { supabase, userId } = identity;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Unable to load the signed-in profile: ${error.message}`);
  }

  if (!profile) {
    redirect("/reimbursements/login");
  }

  return { ...identity, profile };
}

export async function requireAdmin() {
  const context = await requireUser();
  if (context.profile.role !== "admin") {
    redirect("/reimbursements/dashboard");
  }
  return context;
}

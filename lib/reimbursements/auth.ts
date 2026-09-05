import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/reimbursements/supabase/server";

export type SessionProfile = {
  userId: string;
  email: string;
  profile: {
    id: string;
    full_name: string;
    role: "member" | "admin";
  };
};

// Returns the signed-in user and their profile, or null when signed out.
// The two reimbursements sites keep separate host-only sessions, so this
// reflects whichever host the request arrived on.
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return null;
  }

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  return { userId, email, profile };
}

// Submit site (reimbursements.cal.taxi): any signed-in member may submit.
export async function requireMember() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login");
  }
  return session;
}

// Review app (admin.cal.taxi/reimbursements): admins only. Members get an
// error rather than a redirect loop — the layout renders an access-denied
// page for them, and server actions surface the message.
export async function requireAdmin() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/reimbursements/login");
  }
  if (session.profile.role !== "admin") {
    throw new Error("This area is restricted to administrators.");
  }
  return session;
}

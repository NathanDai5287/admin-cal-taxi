import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/reimbursements/supabase/server";

export type SessionProfile = {
  userId: string;
  email: string;
  avatarUrl: string;
  profile: {
    id: string;
    full_name: string;
    role: "none" | "member" | "admin";
  };
};

function avatarUrlFromClaims(claims: { user_metadata?: unknown } | undefined) {
  const metadata = claims?.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return "";
  }
  const record = metadata as Record<string, unknown>;
  if (typeof record.avatar_url === "string") {
    return record.avatar_url;
  }
  if (typeof record.picture === "string") {
    return record.picture;
  }
  return "";
}

// Returns the signed-in user and their profile, or null when there is no
// valid auth session. Sessions are shared across *.cal.taxi in production.
// A signed-in user with no profiles row is treated as role "none" (no access)
// rather than signed out, so a brand-new Google sign-in does not redirect-loop
// while the profile row is still missing.
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    return null;
  }

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  const avatarUrl = avatarUrlFromClaims(data?.claims);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, removed_at")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return {
      userId,
      email,
      avatarUrl,
      profile: { id: userId, full_name: "", role: "none" },
    };
  }

  return {
    userId,
    email,
    avatarUrl,
    // Soft-deleted members keep their row but are treated as having no access.
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.removed_at ? "none" : profile.role,
    },
  };
}

// Submit site (reimbursements.cal.taxi): members and admins may submit.
// Role "none" is signed in but not invited yet — throw rather than redirect
// so the layout can show an access-denied page instead of a login loop.
export async function requireMember(loginPath = "/login") {
  const session = await getSessionProfile();
  if (!session) {
    redirect(loginPath);
  }
  if (session.profile.role === "none") {
    throw new Error(
      "Your account doesn't have access yet. Ask an administrator to invite you.",
    );
  }
  return session;
}

// Review app (admin.cal.taxi/reimbursements): admins only. Members and role
// "none" get an error rather than a redirect loop — the layout renders an
// access-denied page for them, and server actions surface the message.
export async function requireAdmin(loginPath = "/reimbursements/login") {
  const session = await getSessionProfile();
  if (!session) {
    redirect(loginPath);
  }
  if (session.profile.role !== "admin") {
    throw new Error("This area is restricted to administrators.");
  }
  return session;
}

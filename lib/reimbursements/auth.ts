import "server-only";

import { ACCESS_LEVELS, APP_OPTIONS, VIEW_AS_COOKIE, isRoleKey, roleWithAncestors, type AppKey, type AccessLevel, type RoleKey } from "@/lib/app-access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { PostgrestError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { createClient } from "@/lib/reimbursements/supabase/server";

export type SessionProfile = {
  userId: string;
  email: string;
  avatarUrl: string;
  appAccess: Partial<Record<AppKey, AccessLevel>>;
  viewAsRole?: RoleKey;
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

function fullNameFromClaims(claims: { user_metadata?: unknown } | undefined) {
  const metadata = claims?.user_metadata;
  if (!metadata || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  for (const key of ["full_name", "name"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }
  return [record.given_name, record.family_name]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim())
    .join(" ");
}

async function claimInviteWithoutRpc({
  userId,
  email,
  fullName,
}: {
  userId: string;
  email: string;
  fullName: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  try {
    const admin = createAdminClient();
    const { data: invite, error: inviteError } = await admin
      .from("invites")
      .select("role")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (inviteError || !invite || invite.role === "none") {
      if (inviteError) {
        console.error("Could not look up the signed-in user's invite", {
          code: inviteError.code,
          message: inviteError.message,
        });
      }
      return;
    }

    const { data: provisional } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("email", normalizedEmail)
      .maybeSingle();

    let profileError: PostgrestError | null = null;
    if (provisional && provisional.id !== userId) {
      const claimed = await admin.from("profiles")
        .update({
          id: userId,
          email: normalizedEmail,
          full_name: provisional.full_name || fullName,
          role: invite.role,
          has_signed_in: true,
          removed_at: null,
        })
        .eq("id", provisional.id);
      profileError = claimed.error;
    } else {
      const restored = await admin.from("profiles").upsert({
        id: userId,
        email: normalizedEmail,
        full_name: provisional?.full_name || fullName,
        has_signed_in: true,
        role: invite.role,
        removed_at: null,
      });
      profileError = restored.error;
    }
    if (profileError) {
      console.error("Could not restore the invited user's profile", {
        code: profileError.code,
        message: profileError.message,
      });
      return;
    }

    const { error: deleteError } = await admin
      .from("invites")
      .delete()
      .eq("email", normalizedEmail);
    if (deleteError) {
      console.error("Could not remove a claimed invite", {
        code: deleteError.code,
        message: deleteError.message,
      });
    }
  } catch (fallbackError) {
    console.error("Invite reconciliation fallback failed", fallbackError);
  }
}

async function roleAppAccess(supabase: Awaited<ReturnType<typeof createClient>>, role: RoleKey) {
  const { data, error } = await supabase.from("role_app_access").select("app_key, access_level").in("role_key", roleWithAncestors(role));
  if (error) throw new Error("Unable to load app access.");
  const appAccess: Partial<Record<AppKey, AccessLevel>> = {};
  for (const { app_key, access_level } of data) {
    const app = app_key as AppKey;
    if (ACCESS_LEVELS.indexOf(access_level) > ACCESS_LEVELS.indexOf(appAccess[app] ?? "none")) appAccess[app] = access_level;
  }
  return appAccess;
}

// Returns the signed-in user and their profile, or null when there is no
// valid auth session. Sessions are shared across *.cal.taxi in production.
// A signed-in user with no profiles row is treated as role "none" (no access)
// rather than signed out, so a brand-new Google sign-in does not redirect-loop
// while the profile row is still missing.
const loadSessionProfile = async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    return null;
  }

  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  const avatarUrl = avatarUrlFromClaims(data?.claims);
  const claimedFullName = fullNameFromClaims(data?.claims);

  const initialProfileResult = await supabase
    .from("profiles")
    .select("id, full_name, role, removed_at")
    .eq("id", userId)
    .maybeSingle();
  let profile = initialProfileResult.data;

  if (initialProfileResult.error) {
    console.error("Could not load the signed-in user's profile", {
      code: initialProfileResult.error.code,
      message: initialProfileResult.error.message,
    });
  }

  // An auth user can outlive their profile row (older versions hard-deleted
  // profiles). In that case a later invite cannot be consumed by the
  // auth.users INSERT trigger because this is no longer a new auth user.
  // Also check role "none" so invites created outside the admin RPC are
  // reconciled. The RPC only changes data when an invite for the signed-in
  // user's verified auth email exists.
  if (!profile || profile.role === "none" || profile.removed_at) {
    const { error: claimError } = await supabase.rpc("claim_pending_invite");
    if (claimError) {
      console.error("Could not reconcile the signed-in user's invite", {
        code: claimError.code,
        message: claimError.message,
      });
      await claimInviteWithoutRpc({
        userId,
        email,
        fullName: profile?.full_name || claimedFullName,
      });
    }

    // Layouts and pages may run this concurrently. Another request may have
    // claimed the invite while this RPC returned false, so always re-read the
    // profile instead of relying on this call's boolean result.
    const result = await supabase
      .from("profiles")
      .select("id, full_name, role, removed_at")
      .eq("id", userId)
      .maybeSingle();
    if (result.error) {
      console.error("Could not reload the signed-in user's profile", {
        code: result.error.code,
        message: result.error.message,
      });
    }
    profile = result.data;
  }

  if (!profile) {
    return {
      userId,
      email,
      avatarUrl,
      appAccess: {},
      profile: { id: userId, full_name: "", role: "none" },
    };
  }

  const viewAsRole = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (profile.role === "admin" && !profile.removed_at && isRoleKey(viewAsRole) && viewAsRole !== "admin") {
    return {
      userId,
      email,
      avatarUrl,
      viewAsRole,
      appAccess: await roleAppAccess(supabase, viewAsRole),
      profile: { id: profile.id, full_name: profile.full_name, role: "member" },
    };
  }

  const accessResult = await supabase.rpc("get_my_app_access");
  if (accessResult.error) throw new Error("Unable to load app access.");
  const appAccess = Object.fromEntries((accessResult.data ?? []).map((grant) => [grant.app_key, grant.access_level]));

  return {
    userId,
    email,
    avatarUrl,
    appAccess: profile.removed_at ? {} : appAccess,
    // Soft-deleted members keep their row but are treated as having no access.
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.removed_at ? "none" : profile.role,
    },
  };
};

// Root, nested layouts, and pages all need the same session snapshot. React's
// request-scoped cache avoids duplicate profile reads and competing invite
// claims during one render without sharing auth data between requests.
export const getSessionProfile = cache(loadSessionProfile);

// Submit site (reimbursements.cal.taxi): members and admins may submit.
// Role "none" is signed in but not invited yet. Send it to the submit root,
// which renders the access-denied card. Throwing here leaks an opaque Next.js
// server-side exception page on routes such as /history.
export async function requireMember(loginPath = "/login") {
  const session = await getSessionProfile();
  if (!session) {
    redirect(loginPath);
  }
  if (session.profile.role === "none") {
    redirect("/");
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

export function hasAppAccess(session: SessionProfile | null, app: AppKey, level: "read" | "write" = "read") {
  const access = session?.appAccess[app] ?? "none";
  if (level === "write" && session?.viewAsRole) return false;
  return access === "write" || (level === "read" && access === "read");
}

export async function requireAppAccess(app: AppKey, level: "read" | "write" = "read", loginPath = "/") {
  const session = await getSessionProfile();
  if (!session) redirect(loginPath);
  if (level === "write" && session.viewAsRole) throw new Error("View as is on. Exit View as to make changes.");
  if (!hasAppAccess(session, app, level)) {
    const label = APP_OPTIONS.find((option) => option.key === app)?.label ?? app;
    throw new Error(`You do not have ${level} access to ${label}.`);
  }
  return session;
}

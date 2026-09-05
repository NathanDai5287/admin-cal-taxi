"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";

const inviteRoles = ["member", "admin"] as const;
const profileRoles = ["none", "member", "admin"] as const;

type InviteRole = (typeof inviteRoles)[number];
type ProfileRole = (typeof profileRoles)[number];

function isInviteRole(value: unknown): value is InviteRole {
  return inviteRoles.includes(value as InviteRole);
}

function isProfileRole(value: unknown): value is ProfileRole {
  return profileRoles.includes(value as ProfileRole);
}

function readEmail(formData: FormData) {
  const raw = formData.get("email");
  if (typeof raw !== "string") {
    throw new Error("Enter an email address.");
  }
  const email = raw.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

export async function inviteUser(formData: FormData) {
  await requireAdmin("/");
  const email = readEmail(formData);
  const role = formData.get("role");

  if (!isInviteRole(role)) {
    throw new Error("Invite role must be member or admin.");
  }

  const supabase = await createClient();
  // Security definer function: updates an existing profile's role right away,
  // otherwise stores the invite for their first Google sign-in.
  const { error } = await supabase.rpc("admin_invite_email", {
    invite_email: email,
    invite_role: role,
  });

  if (error) {
    throw new Error("Unable to invite user. Please try again.");
  }

  revalidatePath("/users");
}

export async function revokeInvite(formData: FormData) {
  await requireAdmin("/");
  const email = readEmail(formData);

  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("email", email);

  if (error) {
    throw new Error("Unable to revoke invite. Please try again.");
  }

  revalidatePath("/users");
}

export async function setUserRole(formData: FormData) {
  const session = await requireAdmin("/");
  const userId = formData.get("userId");
  const role = formData.get("role");

  if (typeof userId !== "string" || !userId) {
    throw new Error("Missing user.");
  }
  if (!isProfileRole(role)) {
    throw new Error("Role must be none, member, or admin.");
  }
  if (userId === session.userId && role !== "admin") {
    throw new Error("You can't remove your own admin access.");
  }

  const supabase = await createClient();
  // Security definer function: a direct table update would require a broad
  // update grant that the "update your own name" policy would turn into a
  // self-promotion hole.
  const { error } = await supabase.rpc("admin_set_profile_role", {
    target_user_id: userId,
    new_role: role,
  });

  if (error) {
    throw new Error("Unable to update role. Please try again.");
  }

  revalidatePath("/users");
}

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
  const session = await requireAdmin("/");
  const email = readEmail(formData);
  const role = formData.get("role");

  if (!isInviteRole(role)) {
    throw new Error("Invite role must be member or admin.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invites").upsert(
    { email, role, invited_by: session.userId },
    { onConflict: "email" },
  );

  if (error) {
    throw new Error(`Unable to invite user: ${error.message}`);
  }

  revalidatePath("/users");
}

export async function revokeInvite(formData: FormData) {
  await requireAdmin("/");
  const email = readEmail(formData);

  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("email", email);

  if (error) {
    throw new Error(`Unable to revoke invite: ${error.message}`);
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
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);

  if (error) {
    throw new Error(`Unable to update role: ${error.message}`);
  }

  revalidatePath("/users");
}

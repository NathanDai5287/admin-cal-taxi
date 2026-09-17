"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { parseInviteEmails } from "@/lib/reimbursements/invite-emails";
import { sendInviteEmails } from "@/lib/reimbursements/send-invite-email";
import { createClient } from "@/lib/reimbursements/supabase/server";

const inviteRoles = ["member", "admin"] as const;
// 'none' is deliberately excluded: removing access is done by removing the
// user entirely (removeUser), not by assigning a role.
const profileRoles = ["member", "admin"] as const;

type InviteRole = (typeof inviteRoles)[number];
type ProfileRole = (typeof profileRoles)[number];

function isInviteRole(value: unknown): value is InviteRole {
  return inviteRoles.includes(value as InviteRole);
}

function isProfileRole(value: unknown): value is ProfileRole {
  return profileRoles.includes(value as ProfileRole);
}

export async function inviteUser(formData: FormData) {
  await requireAdmin("/");
  const emails = parseInviteEmails(formData.get("email"));
  const role = formData.get("role");

  if (!isInviteRole(role)) {
    throw new Error("Invite role must be member or admin.");
  }

  const supabase = await createClient();
  // Security definer function: updates an existing profile or creates a
  // provisional member profile that can receive dues before first sign-in.
  const results = await Promise.all(
    emails.map((email) =>
      supabase.rpc("admin_invite_email", {
        invite_email: email,
        invite_role: role,
      }),
    ),
  );
  const failedInvites = results.filter(({ error }) => error);

  if (failedInvites.length) {
    revalidatePath("/users");
    throw new Error(
      failedInvites.length === emails.length
        ? "Unable to invite these users. Please try again."
        : `${emails.length - failedInvites.length} invites were saved, but ${failedInvites.length} could not be. Please try the list again.`,
    );
  }

  // Email delivery is optional; the member and their access are created even
  // when a deployment has not configured Resend yet.
  if (process.env.RESEND_API_KEY?.trim()) {
    await sendInviteEmails(emails, role);
  }

  revalidatePath("/users");
  revalidatePath("/finance/accounts/receivable");
}

export async function setUserRole(userId: string, role: string) {
  const session = await requireAdmin("/");

  if (!userId) {
    throw new Error("Missing user.");
  }
  if (!isProfileRole(role)) {
    throw new Error("Role must be member or admin.");
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
  revalidatePath("/finance/accounts/receivable");
}

export async function updatePendingUserName(userId: string, fullName: string) {
  await requireAdmin("/");
  const normalizedName = fullName.trim();

  if (!userId) {
    throw new Error("Missing user.");
  }
  if (!normalizedName || normalizedName.length > 120) {
    throw new Error("Enter a name with 120 characters or fewer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_pending_profile_name", {
    target_user_id: userId,
    new_full_name: normalizedName,
  });

  if (error) {
    throw new Error("Unable to update name. Please try again.");
  }

  revalidatePath("/users");
  revalidatePath("/finance/accounts/receivable");
}

export async function removeUser(userId: string) {
  const session = await requireAdmin("/");

  if (!userId) {
    throw new Error("Missing user.");
  }
  if (userId === session.userId) {
    throw new Error("You can't remove yourself.");
  }

  const supabase = await createClient();
  // Security definer function. Soft delete: the profile is archived
  // (removed_at), which revokes all access and hides them from this page
  // while preserving their reimbursement history. Re-inviting their email
  // restores them.
  const { error } = await supabase.rpc("admin_remove_profile", {
    target_user_id: userId,
  });

  if (error) {
    throw new Error("Unable to remove user. Please try again.");
  }

  revalidatePath("/users");
  revalidatePath("/finance/accounts/receivable");
}

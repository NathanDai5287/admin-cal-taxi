"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { sendDiscordAnnouncement } from "@/lib/reimbursements/discord";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export type MemberAnnouncementState = {
  status: "idle" | "success" | "error";
  message: string;
  sequence: number;
};

const announcementSchema = z.object({
  message: z.string().trim().min(1, "Write a message first.").max(1200),
  recipientIds: z.array(z.string().uuid()).min(1).max(100),
  requestId: z.string().uuid(),
});

function actionError(message: string): MemberAnnouncementState {
  return { status: "error", message, sequence: Date.now() };
}

export async function sendMemberAnnouncement(
  _previousState: MemberAnnouncementState,
  formData: FormData,
): Promise<MemberAnnouncementState> {
  await requireAdmin("/");

  const parsed = announcementSchema.safeParse({
    message: formData.get("message"),
    recipientIds: formData.getAll("recipientId"),
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Check the message and selected members.");
  }

  const requestedIds = [...new Set(parsed.data.recipientIds)];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, discord_user_id")
    .in("id", requestedIds)
    .in("role", ["member", "admin"])
    .is("removed_at", null);

  if (error) {
    return actionError("The selected members could not be checked. Refresh and try again.");
  }

  const profiles = data ?? [];
  if (profiles.length !== requestedIds.length) {
    return actionError("One or more selected members are no longer available. Refresh and choose again.");
  }

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const discordIds = requestedIds.map((id) => profilesById.get(id)?.discord_user_id ?? "");
  if (discordIds.some((id) => !/^\d{15,22}$/.test(id))) {
    return actionError("One or more selected members no longer have a valid Discord ID. Refresh and choose again.");
  }
  const recipients = [...new Set(discordIds)];

  const content = `${parsed.data.message}\n\n${recipients.map((userId) => `<@${userId}>`).join("\n")}`;
  if (content.length > 2000) {
    return actionError("This message is too long for Discord. Shorten it or select fewer members.");
  }

  try {
    await sendDiscordAnnouncement(content, recipients, parsed.data.requestId);
    return {
      status: "success",
      message: `Message sent to ${recipients.length} ${recipients.length === 1 ? "member" : "members"}.`,
      sequence: Date.now(),
    };
  } catch (sendError) {
    console.error("Member Discord announcement failed", sendError);
    return actionError("Discord could not send the message. Check the announcement channel and bot access.");
  }
}

import type { Metadata } from "next";

import { MemberAnnouncementComposer, type AnnouncementMember } from "@/app/(admin)/users/announcements/member-announcement-composer";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { userLabel } from "@/lib/reimbursements/user-label";

export const metadata: Metadata = { title: "Discord messages" };
export const dynamic = "force-dynamic";

export default async function MemberAnnouncementsPage() {
  await requireAdmin("/");
  const admin = createAdminClient();
  const { data, error } = await loadAllPages((from, to) => admin
    .from("profiles")
    .select("id, full_name, email, discord_user_id")
    .in("role", ["member", "admin"])
    .is("removed_at", null)
    .order("full_name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));

  if (error) {
    throw new Error(`Unable to load members: ${error.message}`);
  }

  const members: AnnouncementMember[] = (data ?? []).map((profile) => ({
    id: profile.id,
    name: userLabel(profile.full_name, profile.email),
    email: profile.email,
    discordUserId: profile.discord_user_id,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="page-title">Discord messages</h1>
        <p className="page-lede">Choose members, write a message, and mention them in the chapter announcement channel.</p>
      </div>

      <MemberAnnouncementComposer
        channelConfigured={Boolean(process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID?.trim())}
        members={members}
      />
    </div>
  );
}

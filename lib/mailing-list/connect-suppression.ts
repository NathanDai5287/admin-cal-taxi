import "server-only";
import type { Resend } from "resend";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";

// Drain local opt-outs before preparing/sending any broadcast, including drafts
// prepared before someone unsubscribed. Provider failures stop the send.
export async function syncConnectOptOuts(resend: Resend) {
  const client = createAdminClient();
  const { data, error } = await loadAllPages((from, to) =>
    client
      .from("connect_members")
      .select("profile_id,email")
      .eq("suppression_pending", true)
      .order("profile_id")
      .range(from, to),
  );
  // Existing broadcasting continues to work before the migration is applied.
  const code = (error as { code?: string } | null)?.code;
  if (code === "PGRST205" || code === "42P01") return;
  if (error)
    throw new Error(
      "Connect opt-outs could not be checked. Try again before sending.",
    );
  for (const member of data) {
    const updated = await resend.contacts.update({
      email: member.email,
      unsubscribed: true,
    });
    if (updated.error) {
      if (updated.error.name !== "not_found")
        throw new Error(
          "Connect opt-outs could not be synced to Resend. No broadcast was sent.",
        );
      const created = await resend.contacts.create({
        email: member.email,
        unsubscribed: true,
      });
      if (created.error)
        throw new Error(
          "Connect opt-outs could not be saved in Resend. No broadcast was sent.",
        );
    }
    const saved = await client
      .from("connect_members")
      .update({ suppression_pending: false })
      .eq("profile_id", member.profile_id)
      .eq("subscribed", false);
    if (saved.error)
      throw new Error(
        "Connect opt-out sync could not be recorded. Try again before sending.",
      );
  }
}

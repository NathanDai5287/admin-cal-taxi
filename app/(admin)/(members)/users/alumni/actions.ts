"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import {
  command,
  sendInvitations,
  db,
  provider,
} from "@/lib/alumni-connect/server";
import type { ConnectResult } from "@/lib/alumni-connect/model";
export async function seedAlumniInvitations(
  input: unknown,
): Promise<ConnectResult> {
  const session = await requireAppAccess("users", "write");
  try {
    const result = await sendInvitations(session.userId, input, true);
    revalidatePath("/users/alumni");
    return result;
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof z.ZodError
          ? error.issues[0].message
          : error instanceof Error
            ? error.message
            : "Unable to process invitations.",
    };
  }
}
export async function revokeAlumniInvitation(form: FormData) {
  await requireAppAccess("users", "write");
  const result = await command<{ ok: boolean }>("revoke", {
    id: z.uuid().parse(form.get("id")),
  });
  if (!result.ok)
    throw new Error("No pending invitation matched. Nothing was changed.");
  revalidatePath("/users/alumni");
}
export async function removeAlumniSubscription(form: FormData) {
  await requireAppAccess("users", "write");
  const result = await command<{ ok: boolean }>("block", {
    id: z.uuid().parse(form.get("id")),
  });
  if (!result.ok)
    throw new Error("No active subscription matched. Nothing was changed.");
  revalidatePath("/users/alumni");
}
export async function manageConnectRecord(
  mode: "revoke" | "block" | "unblock" | "release_not_sent",
  id: string,
): Promise<ConnectResult> {
  await requireAppAccess("users", "write");
  try {
    z.enum(["revoke", "block", "unblock", "release_not_sent"]).parse(mode);
    const result = await command<{ ok: boolean }>(mode, {
      id: z.uuid().parse(id),
    });
    if (!result.ok)
      return {
        ok: false,
        message:
          "No eligible record matched. Nothing was changed. Refresh this page.",
      };
    revalidatePath("/users/alumni");
    return {
      ok: true,
      message:
        mode === "unblock"
          ? "Access restored. They can sign in by code and choose to rejoin; no email was sent."
          : mode === "release_not_sent"
            ? "Confirmed unsent address released. You may now submit a corrected invitation."
            : "Updated. Invitation history has been retained.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Nothing was changed. Please try again.",
    };
  }
}
export async function syncConnectProvider(
  ids: string[],
): Promise<ConnectResult> {
  await requireAppAccess("users", "write");
  try {
    const parsed = z.array(z.uuid()).max(50).parse(ids);
    const { data, error } = await db()
      .from("connect_members")
      .select("email,profile_id")
      .in("profile_id", parsed);
    if (error) throw new Error("Subscribers could not be checked.");
    const resend = provider();
    let count = 0;
    for (const member of data ?? []) {
      await new Promise((resolve) => setTimeout(resolve, 550));
      const remote = await resend.contacts.get({ email: member.email });
      if (remote.error && remote.error.name !== "not_found")
        throw new Error(
          "Resend preferences could not be checked. Check the full-access key.",
        );
      if (remote.data?.unsubscribed) {
        await command("provider_optout", { email: member.email });
        count++;
      } else {
        const saved = await db()
          .from("connect_members")
          .update({ provider_checked_at: new Date().toISOString() })
          .eq("profile_id", member.profile_id);
        if (saved.error) throw new Error("Sync status could not be saved.");
      }
    }
    revalidatePath("/users/alumni");
    return {
      ok: true,
      message: `Checked ${data?.length ?? 0} profiles against Resend; ${count} provider opt-outs recorded.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to sync preferences.",
    };
  }
}

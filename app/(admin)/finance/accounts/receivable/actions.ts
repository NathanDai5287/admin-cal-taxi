"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { sendDiscordDuesAnnouncement } from "@/lib/reimbursements/discord";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { createClient } from "@/lib/reimbursements/supabase/server";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function normalizeDiscordUserId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.match(/^<@!?(\d{15,22})>$/)?.[1] ?? trimmed;
}

const entrySchema = z.object({
  memberId: z.string().uuid("member"),
  amountOwed: z.coerce.number().positive("amount").max(999_999_999.99, "amount"),
  dueDate: dateSchema,
  notes: z.string().trim().max(500, "notes"),
  discordUserId: z.string().refine(
    (value) => !value || /^\d{15,22}$/.test(value),
    "discord",
  ),
});

type DuesResult =
  | "added"
  | "saved"
  | "payment"
  | "paid"
  | "reopened"
  | "deleted"
  | "invalid"
  | "invalid-member"
  | "invalid-amount"
  | "invalid-date"
  | "invalid-notes"
  | "invalid-discord"
  | "error";

function resultUrl(result: DuesResult) {
  return `/finance/accounts/receivable?result=${result}`;
}

function entryErrorUrl(error: z.ZodError) {
  const field = error.issues[0]?.path[0];
  if (field === "memberId") return resultUrl("invalid-member");
  if (field === "amountOwed") return resultUrl("invalid-amount");
  if (field === "dueDate") return resultUrl("invalid-date");
  if (field === "notes") return resultUrl("invalid-notes");
  if (field === "discordUserId") return resultUrl("invalid-discord");
  return resultUrl("invalid");
}

function revalidateDues() {
  revalidatePath("/finance/accounts");
  revalidatePath("/finance/accounts/receivable");
  revalidatePath("/finance/planning");
  revalidatePath("/finance/reports");
}

const bulkFeeSchema = z.object({
  amountOwed: z.coerce.number().positive().max(999_999_999.99),
  dueDate: dateSchema,
  memberIds: z.array(z.string().uuid()).min(1).max(500),
});

const bulkMemberSchema = z.object({
  discordUserId: z.string().refine((value) => !value || /^\d{15,22}$/.test(value)),
  notes: z.string().trim().max(500),
});

export async function addDuesFees(formData: FormData) {
  const { userId } = await requireAdmin("/");
  const memberIds = [...new Set(formData.getAll("memberId").filter(
    (value): value is string => typeof value === "string",
  ))];
  const parsed = bulkFeeSchema.safeParse({
    amountOwed: formData.get("amountOwed"),
    dueDate: formData.get("dueDate"),
    memberIds,
  });

  if (!parsed.success) redirect(entryErrorUrl(parsed.error));

  const memberDetails = new Map<string, z.infer<typeof bulkMemberSchema>>();
  for (const memberId of parsed.data.memberIds) {
    const detail = bulkMemberSchema.safeParse({
      discordUserId: normalizeDiscordUserId(formData.get(`discordUserId:${memberId}`)),
      notes: formData.get(`notes:${memberId}`) ?? "",
    });
    if (!detail.success) redirect(resultUrl("invalid"));
    memberDetails.set(memberId, detail.data);
  }

  const supabase = createAdminClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", parsed.data.memberIds)
    .in("role", ["member", "admin"])
    .is("removed_at", null);

  if (profilesError || profiles?.length !== parsed.data.memberIds.length) {
    redirect(resultUrl("error"));
  }

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = parsed.data.memberIds.map((memberId) => {
    const profile = profilesById.get(memberId);
    const detail = memberDetails.get(memberId);
    if (!profile || !detail) return null;
    return {
      member_id: profile.id,
      member_name: profile.full_name.trim() || profile.email,
      amount_assessed: parsed.data.amountOwed,
      amount_paid: 0,
      due_date: parsed.data.dueDate,
      notes: detail.notes,
      discord_user_id: detail.discordUserId,
      created_by: userId,
    };
  });

  if (rows.some((row) => row === null)) redirect(resultUrl("error"));
  const { error } = await supabase.from("chapter_receivables").insert(
    rows.filter((row): row is NonNullable<typeof row> => row !== null),
  );

  if (error) redirect(resultUrl("error"));
  revalidateDues();
  redirect(resultUrl("added"));
}

export async function updateDuesBalance(formData: FormData) {
  await requireAdmin("/");
  const parsed = entrySchema.extend({ id: z.string().uuid() }).safeParse({
    id: formData.get("id"),
    memberId: formData.get("memberId"),
    amountOwed: formData.get("amountOwed"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes") ?? "",
    discordUserId: normalizeDiscordUserId(formData.get("discordUserId")),
  });

  if (!parsed.success) redirect(resultUrl("invalid"));

  const supabase = createAdminClient();
  const { data: current, error: readError } = await supabase
    .from("chapter_receivables")
    .select("member_id, member_name, amount_assessed, amount_paid, updated_at")
    .eq("id", parsed.data.id)
    .single();

  if (readError || !current) redirect(resultUrl("error"));

  let memberName = current.member_name;
  if (parsed.data.memberId !== current.member_id) {
    const { data: member } = await supabase.from("profiles").select("id, full_name, email")
      .eq("id", parsed.data.memberId).in("role", ["member", "admin"]).is("removed_at", null).maybeSingle();
    if (!member) redirect(resultUrl("invalid-member"));
    memberName = member.full_name.trim() || member.email;
  }
  const currentAssessed = Number(current.amount_assessed);
  const currentPaid = Number(current.amount_paid);
  const wasPaid = currentPaid >= currentAssessed;
  const { data: updated, error } = await supabase
    .from("chapter_receivables")
    .update({
      member_id: parsed.data.memberId,
      member_name: memberName,
      amount_assessed: wasPaid ? parsed.data.amountOwed : currentPaid + parsed.data.amountOwed,
      amount_paid: wasPaid ? parsed.data.amountOwed : currentPaid,
      due_date: parsed.data.dueDate,
      notes: parsed.data.notes,
      discord_user_id: parsed.data.discordUserId,
    })
    .eq("id", parsed.data.id)
    .eq("updated_at", current.updated_at)
    .select("id")
    .maybeSingle();

  if (error || !updated) redirect(resultUrl("error"));
  revalidateDues();
  redirect(resultUrl("saved"));
}

export async function setDuesPaid(formData: FormData) {
  await requireAdmin("/");
  const parsed = z.object({
    id: z.string().uuid(),
    paid: z.enum(["true", "false"]),
  }).safeParse({ id: formData.get("id"), paid: formData.get("paid") });

  if (!parsed.success) redirect(resultUrl("invalid"));

  const paid = parsed.data.paid === "true";
  const supabase = await createClient();
  let { data: updated, error } = await supabase.rpc("set_dues_paid_state", {
    p_receivable_id: parsed.data.id,
    p_paid: paid,
  });
  if (error?.code === "PGRST202") {
    const admin = createAdminClient();
    const current = await admin.from("chapter_receivables")
      .select("amount_assessed, updated_at")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (current.error || !current.data) redirect(resultUrl("error"));
    const fallback = await admin.from("chapter_receivables")
      .update({ amount_paid: paid ? Number(current.data.amount_assessed) : 0 })
      .eq("id", parsed.data.id)
      .eq("updated_at", current.data.updated_at)
      .select("id")
      .maybeSingle();
    error = fallback.error;
    updated = Boolean(fallback.data);
  }

  if (error || !updated) redirect(resultUrl("error"));
  revalidateDues();
  redirect(resultUrl(paid ? "paid" : "reopened"));
}

export async function addDuesPayment(formData: FormData) {
  await requireAdmin("/");
  const parsed = z.object({
    id: z.string().uuid(),
    paymentAmount: z.coerce.number().positive().max(999_999_999.99),
    requestId: z.string().uuid(),
  }).safeParse({
    id: formData.get("id"),
    paymentAmount: formData.get("paymentAmount"),
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) redirect(resultUrl("invalid"));

  const supabase = await createClient();
  let { data: recorded, error } = await supabase.rpc("record_dues_payment", {
    p_receivable_id: parsed.data.id,
    p_payment_amount: parsed.data.paymentAmount,
    p_request_id: parsed.data.requestId,
  });

  // Safe rollout fallback while the atomic RPC migration is being applied.
  // Compare-and-swap on updated_at prevents two old/new deployments or tabs
  // from overwriting the same balance after reading it concurrently.
  if (error?.code === "PGRST202") {
    const admin = createAdminClient();
    error = null;
    recorded = false;
    for (let attempt = 0; attempt < 4 && !recorded; attempt += 1) {
      const current = await admin.from("chapter_receivables")
        .select("amount_assessed, amount_paid, updated_at")
        .eq("id", parsed.data.id)
        .maybeSingle();
      if (current.error) {
        error = current.error;
        break;
      }
      if (!current.data) break;
      const nextPaid = Number(current.data.amount_paid) + parsed.data.paymentAmount;
      if (nextPaid > Number(current.data.amount_assessed)) break;
      const updated = await admin.from("chapter_receivables")
        .update({ amount_paid: nextPaid })
        .eq("id", parsed.data.id)
        .eq("updated_at", current.data.updated_at)
        .select("id")
        .maybeSingle();
      if (updated.error) {
        error = updated.error;
        break;
      }
      recorded = Boolean(updated.data);
    }
  }

  if (error) redirect(resultUrl("error"));
  if (!recorded) redirect(resultUrl("invalid"));
  revalidateDues();
  redirect(resultUrl("payment"));
}

export async function deleteDuesBalance(formData: FormData) {
  await requireAdmin("/");
  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) redirect(resultUrl("invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("chapter_receivables").delete().eq("id", parsed.data);

  if (error) redirect(resultUrl("error"));
  revalidateDues();
  redirect(resultUrl("deleted"));
}

export type DuesAnnouncementState = {
  status: "idle" | "success" | "error";
  message: string;
};

const announcementSchema = z.object({
  message: z.string().trim().min(1, "Write an announcement first.").max(1200),
  recipientIds: z.array(z.string().uuid()).min(1, "Choose at least one member."),
});

function formatAnnouncementAmount(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function sendDuesAnnouncement(
  _previousState: DuesAnnouncementState,
  formData: FormData,
): Promise<DuesAnnouncementState> {
  await requireAdmin("/");
  const parsed = announcementSchema.safeParse({
    message: formData.get("message"),
    recipientIds: formData.getAll("recipientId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the announcement and try again.",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chapter_receivables")
    .select("id, member_name, amount_assessed, amount_paid, discord_user_id")
    .in("id", [...new Set(parsed.data.recipientIds)])
    .order("member_name", { ascending: true });

  if (error) {
    return { status: "error", message: "The member balances could not be loaded." };
  }

  const recipients = (data ?? []).flatMap((row) => {
    const amountOwed = Number(row.amount_assessed) - Number(row.amount_paid);
    return amountOwed > 0 && /^\d{15,22}$/.test(row.discord_user_id)
      ? [{ userId: row.discord_user_id, amountOwed }]
      : [];
  });

  if (!recipients.length) {
    return { status: "error", message: "None of the selected members has an outstanding linked balance." };
  }

  const content = `${parsed.data.message}\n\n${recipients
    .map((recipient) => `<@${recipient.userId}> ${formatAnnouncementAmount(recipient.amountOwed)}`)
    .join("\n")}`;

  if (content.length > 2000) {
    return { status: "error", message: "This announcement is too long for Discord. Shorten the message or select fewer members." };
  }

  try {
    await sendDiscordDuesAnnouncement(content, recipients.map((recipient) => recipient.userId));
    return {
      status: "success",
      message: `Announcement sent to ${recipients.length} ${recipients.length === 1 ? "member" : "members"}.`,
    };
  } catch (sendError) {
    console.error("Discord dues announcement failed", sendError);
    return { status: "error", message: "Discord could not send the announcement. Check the announcement channel and bot access." };
  }
}

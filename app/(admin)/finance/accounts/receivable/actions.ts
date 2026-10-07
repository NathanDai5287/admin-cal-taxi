"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import {
  reportDuesInsertFailure,
  reportDuesProfilePreflightFailure,
} from "@/lib/reimbursements/dues-charge-errors";
import { sendDiscordDuesAnnouncement } from "@/lib/reimbursements/discord";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { createClient } from "@/lib/reimbursements/supabase/server";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function currentPacificDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const entrySchema = z.object({
  memberId: z.string().uuid("member"),
  amountOwed: z.coerce.number().positive("amount").max(999_999_999.99, "amount"),
  dueDate: dateSchema,
  notes: z.string().trim().max(500, "notes"),
});

export type DuesActionState = {
  status: "idle" | "success" | "error";
  message: string;
  sequence: number;
};

function actionError(message: string): DuesActionState {
  return { status: "error", message, sequence: Date.now() };
}

function actionSuccess(message: string): DuesActionState {
  return { status: "success", message, sequence: Date.now() };
}

function bulkFeeError(error: z.ZodError): DuesActionState {
  const field = error.issues[0]?.path[0];
  if (field === "amountOwed") return actionError("Enter an amount owed greater than $0.");
  if (field === "dueDate") return actionError("Choose a valid due date.");
  if (field === "notes") return actionError("Keep the note under 500 characters.");
  return actionError("Check the entered amount and balance details, then try again.");
}

const chargeFailureMessages = {
  "member-selection-changed": "The member list changed. Refresh the page and select the members again.",
  "charge-insert-failed": "The charges could not be saved. No charges were added. Please try again.",
} as const;

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
  notes: z.string().trim().max(500),
});

export async function addDuesFees(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  const { userId } = await requireAdmin("/");
  const memberIds = [...new Set(formData.getAll("memberId").filter(
    (value): value is string => typeof value === "string",
  ))];
  const parsed = bulkFeeSchema.safeParse({
    amountOwed: formData.get("amountOwed"),
    dueDate: formData.get("dueDate"),
    memberIds,
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return bulkFeeError(parsed.error);

  const supabase = createAdminClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email, discord_user_id")
    .in("id", parsed.data.memberIds)
    .in("role", ["member", "admin"])
    .is("removed_at", null);

  if (profilesError || profiles?.length !== parsed.data.memberIds.length) {
    return actionError(chargeFailureMessages[reportDuesProfilePreflightFailure({
      error: profilesError,
      selectedMemberIds: parsed.data.memberIds,
      loadedMemberIds: profiles?.map((profile) => profile.id),
    })]);
  }

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = parsed.data.memberIds.map((memberId) => {
    const profile = profilesById.get(memberId);
    if (!profile) return null;
    return {
      member_id: profile.id,
      member_name: profile.full_name.trim() || profile.email,
      amount_assessed: parsed.data.amountOwed,
      amount_paid: 0,
      due_date: parsed.data.dueDate,
      notes: parsed.data.notes,
      discord_user_id: profile.discord_user_id,
      created_by: userId,
    };
  });

  if (rows.some((row) => row === null)) {
    return actionError("The balance could not be saved. Please try again.");
  }
  const { error } = await supabase.from("chapter_receivables").insert(
    rows.filter((row): row is NonNullable<typeof row> => row !== null),
  );

  if (error) {
    return actionError(chargeFailureMessages[reportDuesInsertFailure({
      error,
      selectedMemberIds: parsed.data.memberIds,
    })]);
  }
  revalidateDues();
  return actionSuccess("Dues added to the selected members.");
}

export async function updateDuesBalance(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = entrySchema.extend({ id: z.string().uuid(), updatedAt: z.string().datetime({ offset: true }) }).safeParse({
    id: formData.get("id"),
    updatedAt: formData.get("updatedAt"),
    memberId: formData.get("memberId"),
    amountOwed: formData.get("amountOwed"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return actionError("Check the charge details and try again.");

  const supabase = createAdminClient();
  const { data: current, error: readError } = await supabase
    .from("chapter_receivables")
    .select("member_id, member_name, amount_assessed, amount_paid, discord_user_id, updated_at")
    .eq("id", parsed.data.id)
    .single();

  if (readError || !current) return actionError("The charge could not be loaded.");
  if (current.updated_at !== parsed.data.updatedAt) {
    return actionError("This charge changed in another session. Refresh and try again.");
  }

  let memberName = current.member_name;
  let discordUserId = current.discord_user_id;
  if (parsed.data.memberId !== current.member_id) {
    const { data: member } = await supabase.from("profiles").select("id, full_name, email, discord_user_id")
      .eq("id", parsed.data.memberId).in("role", ["member", "admin"]).is("removed_at", null).maybeSingle();
    if (!member) return actionError("Choose an active registered member.");
    memberName = member.full_name.trim() || member.email;
    discordUserId = member.discord_user_id;
  }
  const currentAssessed = Number(current.amount_assessed);
  const currentPaid = Number(current.amount_paid);
  const wasPaid = currentPaid >= currentAssessed;
  if (wasPaid && parsed.data.amountOwed !== currentAssessed) {
    return actionError("A fully paid charge amount cannot change.");
  }
  const { data: updated, error } = await supabase
    .from("chapter_receivables")
    .update({
      member_id: parsed.data.memberId,
      member_name: memberName,
      amount_assessed: wasPaid ? currentAssessed : currentPaid + parsed.data.amountOwed,
      amount_paid: currentPaid,
      due_date: parsed.data.dueDate,
      notes: parsed.data.notes,
      discord_user_id: discordUserId,
    })
    .eq("id", parsed.data.id)
    .eq("updated_at", current.updated_at)
    .select("id")
    .maybeSingle();

  if (error) return actionError("The charge could not be saved.");
  if (!updated) return actionError("This charge changed in another session. Refresh and try again.");
  revalidateDues();
  return actionSuccess("Charge updated.");
}

export async function setDuesPaid(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = z.object({
    id: z.string().uuid(),
    paid: z.enum(["true", "false"]),
    updatedAt: z.string().datetime({ offset: true }),
  }).safeParse({ id: formData.get("id"), paid: formData.get("paid"), updatedAt: formData.get("updatedAt") });

  if (!parsed.success) return actionError("The payment state could not be changed.");

  const paid = parsed.data.paid === "true";
  const supabase = await createClient();
  const { data: updated, error } = await supabase.rpc("bulk_change_receivable_state", {
    p_rows: [{ id: parsed.data.id, updated_at: parsed.data.updatedAt }],
    p_action: paid ? "paid" : "reopened",
    p_payment_date: currentPacificDate(),
  });

  if (error || !updated) return actionError("The payment state could not be changed. Refresh and try again.");
  revalidateDues();
  return actionSuccess(paid ? "Charge marked fully paid." : "Charge reopened.");
}

const paymentPlanSchema = z.object({
  frequency: z.enum(["weekly", "biweekly", "monthly", "custom"], { error: "Choose a payment frequency." }),
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a dollar amount with at most two decimal places.")
    .transform(Number).pipe(z.number().positive("Enter an amount greater than $0.").max(999_999_999.99, "The payment amount is too large.")),
  intervalDays: z.coerce.number().int("Use a whole number of days.").min(1, "Enter at least one day.").max(2_147_483_647, "The interval is too large.").nullable(),
}).refine((plan) => plan.frequency !== "custom" || plan.intervalDays !== null, {
  message: "Enter the number of days between payments.",
});

export async function updateDuesPaymentPlan(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const version = z.object({ id: z.string().uuid(), updatedAt: z.string().datetime({ offset: true }) }).safeParse({
    id: formData.get("id"), updatedAt: formData.get("updatedAt"),
  });
  if (!version.success) return actionError("This charge could not be identified. Refresh and try again.");

  const enabled = formData.get("paymentPlanEnabled") === "on";
  const parsed = enabled ? paymentPlanSchema.safeParse({
    frequency: formData.get("frequency"),
    amount: formData.get("planAmount"),
    intervalDays: formData.get("frequency") === "custom" ? formData.get("intervalDays") : null,
  }) : null;
  if (parsed && !parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Check the payment plan terms.");
  const plan = parsed?.success ? parsed.data : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_receivable_payment_plan", {
    p_id: version.data.id,
    p_updated_at: version.data.updatedAt,
    p_frequency: plan?.frequency ?? null,
    p_amount: plan?.amount ?? null,
    p_interval_days: plan?.intervalDays ?? null,
  });
  if (error || !data) {
    return actionError(error?.code === "40001"
      ? "This charge changed in another session. Refresh and try again."
      : error?.code === "22023"
        ? "Payment plans can only be edited on outstanding charges. Refresh and check this balance."
        : "The payment plan could not be saved. Please try again.");
  }
  revalidateDues();
  return actionSuccess(plan ? "Payment plan saved." : "Payment plan removed.");
}

export async function addDuesBalanceNote(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = z.object({
    id: z.string().uuid(),
    body: z.string().trim().min(1, "Write a note first.").max(2000, "Keep the note under 2,000 characters."),
    requestId: z.string().uuid(),
  }).safeParse({ id: formData.get("id"), body: formData.get("body"), requestId: formData.get("requestId") });
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Check the note and try again.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_receivable_note", {
    p_receivable_id: parsed.data.id,
    p_body: parsed.data.body,
    p_request_id: parsed.data.requestId,
  });
  if (error || !data) return actionError(error?.code === "40001"
    ? "This balance is no longer available. Refresh and try again."
    : "The note could not be saved. Your text is still here; please try again.");
  revalidatePath("/finance/accounts/receivable");
  return actionSuccess("Note added.");
}

export async function addDuesPayment(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = z.object({
    id: z.string().uuid(),
    paymentAmount: z.coerce.number().positive().max(999_999_999.99),
    paymentDate: dateSchema,
    requestId: z.string().uuid(),
  }).safeParse({
    id: formData.get("id"),
    paymentAmount: formData.get("paymentAmount"),
    paymentDate: formData.get("paymentDate"),
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) return actionError("Check the payment amount and date.");

  const supabase = await createClient();
  let { data: recorded, error } = await supabase.rpc("record_dues_payment", {
    p_receivable_id: parsed.data.id,
    p_payment_amount: parsed.data.paymentAmount,
    p_payment_date: parsed.data.paymentDate,
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

  if (error) return actionError("The payment could not be recorded.");
  if (!recorded) return actionError("This balance changed. Refresh and try again.");
  revalidateDues();
  return actionSuccess("Payment recorded.");
}

export async function waiveDuesBalance(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = z.object({ id: z.string().uuid(), updatedAt: z.string().datetime({ offset: true }) }).safeParse({
    id: formData.get("id"),
    updatedAt: formData.get("updatedAt"),
  });
  if (!parsed.success) return actionError("The charge could not be waived.");

  const supabase = await createClient();
  const { data: waived, error } = await supabase.rpc("bulk_change_receivable_state", {
    p_rows: [{ id: parsed.data.id, updated_at: parsed.data.updatedAt }],
    p_action: "waived",
    p_payment_date: currentPacificDate(),
  });

  if (error || !waived) return actionError("The charge changed. Refresh and try again.");
  revalidateDues();
  return actionSuccess("Charge waived.");
}

const bulkBalanceVersionsSchema = z.array(z.object({ id: z.string().uuid(), updated_at: z.string().datetime({ offset: true }) })).min(1).max(200);

function readBalanceVersions(formData: FormData) {
  const values = [...new Set(formData.getAll("balanceVersion").filter(
    (value): value is string => typeof value === "string",
  ))];
  return bulkBalanceVersionsSchema.safeParse(values.map((value) => {
    const [id, updated_at] = value.split("|");
    return { id, updated_at };
  }));
}

export async function bulkSetDuesPaid(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = readBalanceVersions(formData);
  if (!parsed.success) return actionError("Select at least one charge.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_change_receivable_state", {
    p_rows: parsed.data,
    p_action: "paid",
    p_payment_date: currentPacificDate(),
  });
  if (error || !data) return actionError("Some charges changed. Refresh and check the selected charges.");

  revalidateDues();
  return actionSuccess("Selected charges marked fully paid.");
}

export async function bulkWaiveDuesBalances(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const parsed = readBalanceVersions(formData);
  if (!parsed.success) return actionError("Select at least one charge.");

  const supabase = await createClient();
  const { data: waived, error } = await supabase.rpc("bulk_change_receivable_state", {
    p_rows: parsed.data,
    p_action: "waived",
    p_payment_date: currentPacificDate(),
  });

  if (error || !waived) {
    return actionError("Some charges changed. Refresh and check the selected charges.");
  }
  revalidateDues();
  return actionSuccess("Selected charges waived.");
}

const bulkEditSchema = z.object({
  rows: z.array(z.object({ id: z.string().uuid(), updated_at: z.string().datetime({ offset: true }) })).min(1).max(200),
  applyDueDate: z.boolean(),
  applyAmount: z.boolean(),
  applyNotes: z.boolean(),
  dueDate: dateSchema.optional(),
  amountAssessed: z.coerce.number().positive().max(999_999_999.99).optional(),
  notes: z.string().trim().max(500),
}).refine((value) => value.applyDueDate || value.applyAmount || value.applyNotes, {
  message: "Choose at least one field to change.",
}).refine((value) => !value.applyDueDate || Boolean(value.dueDate), {
  message: "Choose a due date.",
}).refine((value) => !value.applyAmount || value.amountAssessed !== undefined, {
  message: "Enter a charge amount.",
});

export async function bulkUpdateDuesBalances(
  _previousState: DuesActionState,
  formData: FormData,
): Promise<DuesActionState> {
  await requireAdmin("/");
  const versions = formData.getAll("balanceVersion").filter(
    (value): value is string => typeof value === "string",
  );
  const parsed = bulkEditSchema.safeParse({
    rows: versions.map((value) => {
      const [id, updated_at] = value.split("|");
      return { id, updated_at };
    }),
    applyDueDate: formData.get("applyDueDate") === "on",
    applyAmount: formData.get("applyAmount") === "on",
    applyNotes: formData.get("applyNotes") === "on",
    dueDate: formData.get("dueDate") || undefined,
    amountAssessed: formData.get("amountAssessed") || undefined,
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Check the bulk changes.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_update_receivables", {
    p_rows: parsed.data.rows,
    p_due_date: parsed.data.dueDate ?? null,
    p_amount_assessed: parsed.data.amountAssessed ?? null,
    p_notes: parsed.data.notes,
    p_apply_due_date: parsed.data.applyDueDate,
    p_apply_amount: parsed.data.applyAmount,
    p_apply_notes: parsed.data.applyNotes,
  });

  if (error || !data) {
    const message = error?.message.includes("changed")
      ? "One or more charges changed. Refresh and try again."
      : error?.message.includes("fully paid") || error?.message.includes("below payments")
        ? "The amount cannot be below payments or change a fully paid charge."
        : "No charges changed. Check the values and try again.";
    return actionError(message);
  }

  revalidateDues();
  return actionSuccess(`${parsed.data.rows.length} ${parsed.data.rows.length === 1 ? "charge" : "charges"} updated.`);
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

import "server-only";

import { formatCategory } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const discordApi = "https://discord.com/api/v10";
const approvedEmoji = "✅";
const deniedEmoji = "❌";

type DiscordMessage = {
  id: string;
  channel_id: string;
};

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function truncate(value: string, maximum: number) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function discordRequest(path: string, init: RequestInit = {}) {
  const token = requiredEnvironmentVariable("DISCORD_BOT_TOKEN");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${discordApi}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        ...init.headers,
      },
    });

    if (response.status === 429 && attempt < 3) {
      const rateLimit = await response.json().catch(() => null) as { retry_after?: number } | null;
      const retryAfter = typeof rateLimit?.retry_after === "number"
        ? rateLimit.retry_after * 1000
        : Number(response.headers.get("retry-after") ?? 1) * 1000;
      await wait(Math.max(250, Math.ceil(retryAfter)));
      continue;
    }

    if (!response.ok) {
      const detail = truncate(await response.text(), 500);
      throw new Error(`Discord API ${response.status}: ${detail || response.statusText}`);
    }

    return response;
  }

  throw new Error("Discord API request exceeded its retry limit.");
}

async function addDecisionReactions(channelId: string, messageId: string) {
  for (const emoji of [approvedEmoji, deniedEmoji]) {
    await discordRequest(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      { method: "PUT" },
    );
  }
}

function receiptFilename(receiptPath: string) {
  const extension = receiptPath.toLowerCase().endsWith(".png") ? "png" : "jpg";
  return `receipt.${extension}`;
}

export async function notifyDiscordOfReimbursement(reimbursementId: string) {
  const channelId = requiredEnvironmentVariable("DISCORD_CHANNEL_ID");
  const admin = createAdminClient();
  const { data: reimbursement, error } = await admin
    .from("reimbursements")
    .select("id, full_name, category, amount, description, payment_method, receipt_path, status, merchant, receipt_date, receipt_total, submitted_at, discord_message_id, discord_channel_id")
    .eq("id", reimbursementId)
    .single();

  if (error || !reimbursement) {
    throw error ?? new Error("Reimbursement not found.");
  }

  if (reimbursement.status === "pending") {
    return { status: "pending" as const };
  }

  if (reimbursement.discord_message_id) {
    await addDecisionReactions(
      reimbursement.discord_channel_id ?? channelId,
      reimbursement.discord_message_id,
    );
    return { status: "already_notified" as const, messageId: reimbursement.discord_message_id };
  }

  const { data: receipt, error: receiptError } = await admin.storage
    .from("receipts")
    .download(reimbursement.receipt_path);
  if (receiptError || !receipt) {
    throw receiptError ?? new Error("Receipt image could not be downloaded.");
  }

  const filename = receiptFilename(reimbursement.receipt_path);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const reviewUrl = siteUrl
    ? new URL(`/reimbursements/${reimbursement.id}`, siteUrl).toString()
    : undefined;
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(reimbursement.amount));
  const fields = [
    { name: "Submitted by", value: truncate(reimbursement.full_name, 1024), inline: true },
    { name: "Amount", value: amount, inline: true },
    { name: "Category", value: formatCategory(reimbursement.category), inline: true },
    { name: "Description", value: truncate(reimbursement.description, 1024) },
    { name: "Zelle", value: truncate(reimbursement.payment_method, 1024), inline: true },
    { name: "Auto-check", value: reimbursement.status.replaceAll("_", " "), inline: true },
  ];

  if (reimbursement.merchant) {
    fields.splice(3, 0, { name: "Merchant", value: truncate(reimbursement.merchant, 1024), inline: true });
  }
  if (reimbursement.receipt_total !== null) {
    fields.splice(4, 0, {
      name: "Receipt total",
      value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
        .format(Number(reimbursement.receipt_total)),
      inline: true,
    });
  }

  const form = new FormData();
  form.set("payload_json", JSON.stringify({
    nonce: reimbursement.id.replaceAll("-", "").slice(0, 25),
    enforce_nonce: true,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: "New reimbursement submission",
      description: `${approvedEmoji} Approve  •  ${deniedEmoji} Deny`,
      color: 0xf2a33a,
      fields,
      image: { url: `attachment://${filename}` },
      footer: { text: `Submission ${reimbursement.id}` },
      timestamp: reimbursement.submitted_at,
      ...(reviewUrl ? { url: reviewUrl } : {}),
    }],
    attachments: [{ id: 0, filename }],
  }));
  form.set("files[0]", receipt, filename);

  const response = await discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: form,
  });
  const message = await response.json() as DiscordMessage;
  if (!message.id || !message.channel_id) {
    throw new Error("Discord returned an invalid message response.");
  }

  const { error: updateError } = await admin
    .from("reimbursements")
    .update({
      discord_message_id: message.id,
      discord_channel_id: message.channel_id,
      discord_notified_at: new Date().toISOString(),
    })
    .eq("id", reimbursement.id);
  if (updateError) throw updateError;

  await addDecisionReactions(message.channel_id, message.id);
  return { status: "notified" as const, messageId: message.id };
}

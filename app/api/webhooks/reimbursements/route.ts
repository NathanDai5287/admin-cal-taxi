import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { notifyDiscordOfReimbursement } from "@/lib/reimbursements/discord";

export const runtime = "nodejs";
export const maxDuration = 60;

const payloadSchema = z.object({
  type: z.enum(["INSERT", "UPDATE"]),
  table: z.literal("reimbursements"),
  schema: z.literal("public"),
  record: z.object({ id: z.uuid() }),
});

function secretsMatch(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length
    && timingSafeEqual(receivedBytes, expectedBytes);
}

export async function POST(request: Request) {
  if (!secretsMatch(
    request.headers.get("x-webhook-secret"),
    process.env.REIMBURSEMENTS_WEBHOOK_SECRET,
  )) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  try {
    const result = await notifyDiscordOfReimbursement(payload.data.record.id);
    return Response.json(result, { status: result.status === "pending" ? 202 : 200 });
  } catch (error) {
    console.error("Discord reimbursement notification failed", error);
    return Response.json({ error: "Discord notification failed" }, { status: 502 });
  }
}

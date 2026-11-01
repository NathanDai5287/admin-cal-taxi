"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppAccess } from "@/lib/reimbursements/auth";
import { prepareHostingSettlementEmail } from "@/lib/host-settlement-email";
import {
  hostingEvidenceFileSchema,
  hostingSettlementInputSchema,
  prepareHostingEvidenceUploads,
  recordHostingEvidence,
  removeHostingEvidence,
  saveHostingSettlement,
} from "@/lib/host-settlement-service";

const orderIdSchema = z.string().min(1).max(200);
function failure(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "Request failed. Please retry." };
}
function refresh(orderId: string) {
  revalidatePath(`/host/orders/${orderId}`);
  revalidatePath("/host/orders");
}

export async function saveHostingSettlementAction(input: z.input<typeof hostingSettlementInputSchema>) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    const parsed = hostingSettlementInputSchema.parse(input);
    const data = await saveHostingSettlement(parsed, userId);
    refresh(parsed.orderId);
    return { ok: true as const, data };
  } catch (error) { return failure(error); }
}

export async function prepareHostingEvidenceUploadsAction(input: { orderId: string; count: number }) {
  await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, count: z.number().int().min(1).max(10) }).parse(input);
    const targets = await prepareHostingEvidenceUploads(parsed.orderId, parsed.count);
    return { ok: true as const, data: targets };
  } catch (error) { return failure(error); }
}

export async function recordHostingEvidenceAction(input: { orderId: string; files: z.input<typeof hostingEvidenceFileSchema>[] }) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, files: z.array(hostingEvidenceFileSchema).min(1).max(10) }).parse(input);
    const inserted = await recordHostingEvidence(parsed.orderId, parsed.files, userId);
    refresh(parsed.orderId);
    return { ok: true as const, data: inserted };
  } catch (error) { return failure(error); }
}

export async function removeHostingEvidenceAction(input: { orderId: string; evidenceId: string }) {
  await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, evidenceId: z.uuid() }).parse(input);
    await removeHostingEvidence(parsed.orderId, parsed.evidenceId);
    refresh(parsed.orderId);
    return { ok: true as const, data: null };
  } catch (error) { return failure(error); }
}

export async function prepareHostingSettlementEmailAction(input: { orderId: string; settlementRevision: number }) {
  await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, settlementRevision: z.number().int().positive() }).parse(input);
    return { ok: true as const, data: await prepareHostingSettlementEmail(parsed) };
  } catch (error) { return failure(error); }
}

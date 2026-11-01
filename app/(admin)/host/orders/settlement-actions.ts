"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOrderFresh } from "@/lib/host-orders";
import { sharedStateFromSnapshot } from "@/lib/host-state-model";
import { HOSTING_EVIDENCE_BUCKET, loadDepositSettlement } from "@/lib/host-settlement";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { workflowDb } from "@/lib/host-workflow";
import { prepareHostingSettlementEmail } from "@/lib/host-settlement-email";

const orderIdSchema = z.string().min(1).max(200);
const itemSchema = z.object({
  id: z.uuid(),
  category: z.enum(["damage", "plumbing", "cleaning", "missing_property", "other"]),
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive().max(1_000_000),
  clubs: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
});
const saveSchema = z.object({
  orderId: orderIdSchema,
  refundMethod: z.string().trim().max(120),
  refundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  items: z.array(itemSchema).min(1).max(25),
});

function failure(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "Request failed. Please retry." };
}
function refresh(orderId: string) {
  revalidatePath(`/host/orders/${orderId}`);
  revalidatePath("/host/orders");
}

export async function saveHostingSettlementAction(input: z.input<typeof saveSchema>) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    const parsed = saveSchema.parse(input);
    const order = await getOrderFresh(parsed.orderId);
    if (!order || order.statusOverride === "cancelled" || !order.depositAmount || order.depositAmount <= 0) throw new Error("This order cannot have a deposit settlement.");
    const allowedClubs = new Set((sharedStateFromSnapshot(order.snapshot).clubs.length ? sharedStateFromSnapshot(order.snapshot).clubs : [order.clubName]).map(club => club.trim()));
    if (parsed.items.some(item => item.clubs.some(club => !allowedClubs.has(club)))) throw new Error("Choose responsible clubs from this order.");
    const cents = parsed.items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    if (cents > Math.round(order.depositAmount * 100)) throw new Error("Deductions cannot exceed the recorded deposit.");
    const db = workflowDb();
    const saved = await db.rpc("save_hosting_damage_settlement", {
      p_order_id: order.id,
      p_deposit_amount: order.depositAmount,
      p_refund_method: parsed.refundMethod,
      p_refund_date: parsed.refundDate,
      p_items: parsed.items.map((item, position) => ({ ...item, position })),
      p_user_id: userId,
    });
    if (saved.error) throw new Error(saved.error.message);
    const current = await db.from("hosting_damage_settlements").select("revision").eq("id", saved.data).single();
    if (current.error) throw new Error("The settlement was saved but could not be reloaded.");
    refresh(order.id);
    return { ok: true as const, data: { id: saved.data as string, revision: current.data.revision as number } };
  } catch (error) { return failure(error); }
}

export async function prepareHostingEvidenceUploadsAction(input: { orderId: string; count: number }) {
  await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, count: z.number().int().min(1).max(10) }).parse(input);
    const settlement = await loadDepositSettlement(parsed.orderId);
    if (!settlement || settlement.status !== "draft") throw new Error("Save an editable settlement before adding photos.");
    const storage = workflowDb().storage.from(HOSTING_EVIDENCE_BUCKET);
    const targets = await Promise.all(Array.from({ length: parsed.count }, async () => {
      const result = await storage.createSignedUploadUrl(`${settlement.id}/${crypto.randomUUID()}.jpg`);
      if (result.error) throw new Error("A photo upload could not be prepared.");
      return { path: result.data.path, token: result.data.token };
    }));
    return { ok: true as const, data: targets };
  } catch (error) { return failure(error); }
}

const uploadedFileSchema = z.object({
  path: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(240),
  itemId: z.uuid().nullable(),
  caption: z.string().trim().max(500),
});
export async function recordHostingEvidenceAction(input: { orderId: string; files: z.input<typeof uploadedFileSchema>[] }) {
  const { userId } = await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, files: z.array(uploadedFileSchema).min(1).max(10) }).parse(input);
    const settlement = await loadDepositSettlement(parsed.orderId);
    if (!settlement || settlement.status !== "draft") throw new Error("This settlement can no longer accept evidence.");
    if (parsed.files.some(file => !file.path.startsWith(`${settlement.id}/`) || (file.itemId && !settlement.items.some(item => item.id === file.itemId)))) throw new Error("A photo does not belong to this settlement.");
    const storage = workflowDb().storage.from(HOSTING_EVIDENCE_BUCKET);
    const listing = await storage.list(settlement.id, { limit: 100 });
    if (listing.error) throw new Error("Uploaded photos could not be verified.");
    const byName = new Map((listing.data ?? []).map(file => [file.name, file]));
    const rows = parsed.files.map(file => {
      const stored = byName.get(file.path.split("/").pop()!);
      const byteSize = Number(stored?.metadata?.size ?? 0);
      if (!stored || byteSize <= 0 || byteSize > 10 * 1024 * 1024 || stored.metadata?.mimetype !== "image/jpeg") throw new Error(`“${file.filename}” was not uploaded as a valid JPEG.`);
      return { settlement_id: settlement.id, item_id: file.itemId, storage_path: file.path, filename: file.filename, content_type: "image/jpeg", byte_size: byteSize, caption: file.caption, created_by: userId };
    });
    const inserted = await workflowDb().from("hosting_damage_evidence").insert(rows).select("id");
    if (inserted.error) throw new Error("The uploaded photos could not be added to the settlement.");
    refresh(parsed.orderId);
    return { ok: true as const, data: inserted.data };
  } catch (error) { return failure(error); }
}

export async function removeHostingEvidenceAction(input: { orderId: string; evidenceId: string }) {
  await requireAppAccess("host", "write");
  try {
    const parsed = z.object({ orderId: orderIdSchema, evidenceId: z.uuid() }).parse(input);
    const settlement = await loadDepositSettlement(parsed.orderId);
    if (!settlement || settlement.status !== "draft") throw new Error("Sent settlement evidence cannot be removed.");
    const db = workflowDb();
    const row = await db.from("hosting_damage_evidence").select("storage_path").eq("id", parsed.evidenceId).eq("settlement_id", settlement.id).maybeSingle();
    if (row.error || !row.data) throw new Error("Photo not found.");
    const removed = await db.storage.from(HOSTING_EVIDENCE_BUCKET).remove([row.data.storage_path]);
    if (removed.error) throw new Error("The photo could not be removed from private storage.");
    const deleted = await db.from("hosting_damage_evidence").delete().eq("id", parsed.evidenceId).eq("settlement_id", settlement.id);
    if (deleted.error) throw new Error("The photo was removed, but its record could not be cleared. Reload before retrying.");
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

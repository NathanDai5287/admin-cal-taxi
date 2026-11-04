import "server-only";

import { z } from "zod";

import { getOrderFresh } from "./host-orders";
import { sharedStateFromSnapshot } from "./host-state-model";
import { HOSTING_EVIDENCE_BUCKET, loadDepositSettlement } from "./host-settlement";
import { workflowDb } from "./host-workflow";

const orderIdSchema = z.string().min(1).max(200);
const itemSchema = z.object({
  id: z.uuid(),
  category: z.enum(["damage", "plumbing", "cleaning", "missing_property", "other"]),
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive().max(1_000_000),
  clubs: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
});
export const hostingSettlementInputSchema = z.object({
  orderId: orderIdSchema,
  refundMethod: z.string().trim().max(120).default(""),
  refundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  items: z.array(itemSchema).min(1).max(25),
});

export async function saveHostingSettlement(input: z.input<typeof hostingSettlementInputSchema>, userId: string) {
  const parsed = hostingSettlementInputSchema.parse(input);
  const order = await getOrderFresh(parsed.orderId);
  if (!order || order.statusOverride === "cancelled" || !order.depositAmount || order.depositAmount <= 0) throw new Error("This order cannot have a deposit settlement.");
  const state = sharedStateFromSnapshot(order.snapshot);
  const allowedClubs = new Set((state.clubs.length ? state.clubs : [order.clubName]).map(club => club.trim()));
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
  return { id: saved.data as string, revision: current.data.revision as number };
}

export async function prepareHostingEvidenceUploads(orderId: string, count: number) {
  const parsed = z.object({ orderId: orderIdSchema, count: z.number().int().min(1).max(10) }).parse({ orderId, count });
  const settlement = await loadDepositSettlement(parsed.orderId);
  if (!settlement || settlement.status !== "draft") throw new Error("Save an editable settlement before adding photos.");
  const storage = workflowDb().storage.from(HOSTING_EVIDENCE_BUCKET);
  return Promise.all(Array.from({ length: parsed.count }, async () => {
    const result = await storage.createSignedUploadUrl(`${settlement.id}/${crypto.randomUUID()}.jpg`);
    if (result.error) throw new Error("A photo upload could not be prepared.");
    return { path: result.data.path, token: result.data.token, signedUrl: result.data.signedUrl };
  }));
}

export const hostingEvidenceFileSchema = z.object({
  path: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(240),
  itemId: z.uuid().nullable(),
  caption: z.string().trim().max(500),
});

export async function recordHostingEvidence(orderId: string, files: z.input<typeof hostingEvidenceFileSchema>[], userId: string) {
  const parsed = z.object({ orderId: orderIdSchema, files: z.array(hostingEvidenceFileSchema).min(1).max(10) }).parse({ orderId, files });
  const settlement = await loadDepositSettlement(parsed.orderId);
  if (!settlement || settlement.status !== "draft") throw new Error("This settlement can no longer accept evidence.");
  if (parsed.files.some(file => !file.path.startsWith(`${settlement.id}/`) || (file.itemId && !settlement.items.some(item => item.id === file.itemId)))) throw new Error("A photo does not belong to this settlement.");
  const db = workflowDb();
  const storage = db.storage.from(HOSTING_EVIDENCE_BUCKET);
  const listing = await storage.list(settlement.id, { limit: 100 });
  if (listing.error) throw new Error("Uploaded photos could not be verified.");
  const byName = new Map((listing.data ?? []).map(file => [file.name, file]));
  const rows = parsed.files.map(file => {
    const stored = byName.get(file.path.split("/").pop()!);
    const byteSize = Number(stored?.metadata?.size ?? 0);
    if (!stored || byteSize <= 0 || byteSize > 10 * 1024 * 1024 || stored.metadata?.mimetype !== "image/jpeg") throw new Error(`“${file.filename}” was not uploaded as a valid JPEG.`);
    return { settlement_id: settlement.id, item_id: file.itemId, storage_path: file.path, filename: file.filename, content_type: "image/jpeg", byte_size: byteSize, caption: file.caption, created_by: userId };
  });
  const inserted = await db.from("hosting_damage_evidence").insert(rows).select("id");
  if (inserted.error) throw new Error("The uploaded photos could not be added to the settlement.");
  return inserted.data;
}

export async function removeHostingEvidence(orderId: string, evidenceId: string) {
  z.object({ orderId: orderIdSchema, evidenceId: z.uuid() }).parse({ orderId, evidenceId });
  const settlement = await loadDepositSettlement(orderId);
  if (!settlement || settlement.status !== "draft") throw new Error("Sent settlement evidence cannot be removed.");
  const db = workflowDb();
  const row = await db.from("hosting_damage_evidence").select("storage_path").eq("id", evidenceId).eq("settlement_id", settlement.id).maybeSingle();
  if (row.error || !row.data) throw new Error("Photo not found.");
  const removed = await db.storage.from(HOSTING_EVIDENCE_BUCKET).remove([row.data.storage_path]);
  if (removed.error) throw new Error("The photo could not be removed from private storage.");
  const deleted = await db.from("hosting_damage_evidence").delete().eq("id", evidenceId).eq("settlement_id", settlement.id);
  if (deleted.error) throw new Error("The photo was removed, but its record could not be cleared. Reload before retrying.");
}

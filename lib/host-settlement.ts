import "server-only";

import { workflowDb } from "./host-workflow";
import { listOrders } from "./host-orders";
import {
  hostingClubKey,
  type ClubDamageHistory,
  type ClubDamageSummary,
  type DamageCategory,
  type DepositSettlement,
} from "./host-settlement-types";

export type {
  ClubDamageHistory,
  ClubDamageSummary,
  DamageCategory,
  DamageEvidence,
  DamageItem,
  DepositSettlement,
} from "./host-settlement-types";

export const HOSTING_EVIDENCE_BUCKET = "hosting-damage-evidence";

type SettlementRow = {
  id: string; order_id: string; deposit_amount: number; refund_method: string; refund_date: string | null;
  status: DepositSettlement["status"]; revision: number; notice_sent_at: string | null; returned_at: string | null;
};

function settlementSchemaMissing(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205"
    || (!!error?.message?.includes("hosting_damage_")
      && (error.message.includes("does not exist") || error.message.includes("Could not find the table")));
}

export async function loadDepositSettlement(orderId: string): Promise<DepositSettlement | null> {
  const db = workflowDb();
  const settlement = await db.from("hosting_damage_settlements").select("id,order_id,deposit_amount,refund_method,refund_date,status,revision,notice_sent_at,returned_at").eq("order_id", orderId).maybeSingle();
  // Keep existing order pages available while a production deployment and its
  // additive database migration roll out independently.
  if (settlementSchemaMissing(settlement.error)) return null;
  if (settlement.error) throw new Error("Unable to load the deposit settlement.");
  if (!settlement.data) return null;
  const row = settlement.data as SettlementRow;
  const [itemsResult, evidenceResult] = await Promise.all([
    db.from("hosting_damage_items").select("id,category,description,amount,responsible_clubs,position").eq("settlement_id", row.id).order("position"),
    db.from("hosting_damage_evidence").select("id,item_id,storage_path,filename,content_type,byte_size,caption").eq("settlement_id", row.id).order("created_at"),
  ]);
  if (itemsResult.error || evidenceResult.error) throw new Error("Unable to load settlement details.");
  const evidenceRows = (evidenceResult.data ?? []) as { id: string; item_id: string | null; storage_path: string; filename: string; content_type: "image/jpeg"; byte_size: number; caption: string }[];
  const signed = evidenceRows.length
    ? await db.storage.from(HOSTING_EVIDENCE_BUCKET).createSignedUrls(evidenceRows.map(item => item.storage_path), 900)
    : { data: [], error: null };
  if (signed.error) throw new Error("Unable to load settlement photos.");
  const urls = new Map((signed.data ?? []).map(item => [item.path, item.signedUrl]));
  return {
    id: row.id,
    orderId: row.order_id,
    depositAmount: Number(row.deposit_amount),
    refundMethod: row.refund_method,
    refundDate: row.refund_date,
    status: row.status,
    revision: row.revision,
    noticeSentAt: row.notice_sent_at,
    returnedAt: row.returned_at,
    items: ((itemsResult.data ?? []) as { id: string; category: DamageCategory; description: string; amount: number; responsible_clubs: string[]; position: number }[]).map(item => ({
      id: item.id, category: item.category, description: item.description, amount: Number(item.amount), clubs: item.responsible_clubs, position: item.position,
    })),
    evidence: evidenceRows.map(item => ({
      id: item.id, itemId: item.item_id, filename: item.filename, contentType: item.content_type,
      byteSize: item.byte_size, caption: item.caption, url: urls.get(item.storage_path) ?? "",
    })),
  };
}

export async function loadClubDamageHistory(clubs: string[], currentOrderId: string): Promise<ClubDamageHistory[]> {
  const clean = [...new Set(clubs.map(club => club.trim()).filter(Boolean))];
  if (!clean.length) return [];
  const keys = clean.map(hostingClubKey).filter(Boolean);
  const result = await workflowDb().from("hosting_damage_items")
    .select("description,amount,responsible_clubs,settlement:hosting_damage_settlements!inner(order_id,status)")
    .overlaps("responsible_club_keys", keys)
    .limit(100);
  if (settlementSchemaMissing(result.error)) return [];
  if (result.error) throw new Error("Unable to load club damage history.");
  const grouped = new Map<string, ClubDamageHistory>();
  for (const raw of result.data ?? []) {
    const row = raw as unknown as { description: string; amount: number; responsible_clubs: string[]; settlement: { order_id: string; status: DepositSettlement["status"] } };
    if (row.settlement.order_id === currentOrderId) continue;
    const current = grouped.get(row.settlement.order_id) ?? { orderId: row.settlement.order_id, eventDate: "", clubs: [], total: 0, descriptions: [], status: row.settlement.status };
    current.total += Number(row.amount);
    current.descriptions.push(row.description);
    current.clubs = [...new Set([...current.clubs, ...row.responsible_clubs])];
    grouped.set(current.orderId, current);
  }
  if (!grouped.size) return [];
  const orders = await listOrders().catch(() => []);
  const byId = new Map(orders.map(order => [order.id, order]));
  return [...grouped.values()].map(entry => {
    const order = byId.get(entry.orderId);
    return { ...entry, eventDate: order?.eventDate ?? "", clubs: order ? [order.clubName] : entry.clubs };
  }).sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

export async function loadDamageHistoryOverview(): Promise<ClubDamageSummary[]> {
  const [itemsResult, orders] = await Promise.all([
    workflowDb().from("hosting_damage_items").select("description,amount,responsible_clubs,responsible_club_keys,settlement:hosting_damage_settlements!inner(order_id,status)").limit(2000),
    listOrders(),
  ]);
  if (settlementSchemaMissing(itemsResult.error)) return [];
  if (itemsResult.error) throw new Error("Unable to load hosting damage history.");
  const orderMap = new Map(orders.map(order => [order.id, order]));
  const clubs = new Map<string, { name: string; events: Map<string, ClubDamageHistory> }>();
  for (const raw of itemsResult.data ?? []) {
    const row = raw as unknown as { description: string; amount: number; responsible_clubs: string[]; responsible_club_keys: string[]; settlement: { order_id: string; status: DepositSettlement["status"] } };
    row.responsible_clubs.forEach(name => {
      const key = hostingClubKey(name);
      const club = clubs.get(key) ?? { name, events: new Map<string, ClubDamageHistory>() };
      const order = orderMap.get(row.settlement.order_id);
      const event = club.events.get(row.settlement.order_id) ?? {
        orderId: row.settlement.order_id, eventDate: order?.eventDate ?? "", clubs: order ? [order.clubName] : row.responsible_clubs,
        total: 0, descriptions: [], status: row.settlement.status,
      };
      event.total += Number(row.amount);
      event.descriptions.push(row.description);
      club.events.set(event.orderId, event);
      clubs.set(key, club);
    });
  }
  return [...clubs.entries()].map(([key, club]) => {
    const events = [...club.events.values()].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    return { key, name: club.name, incidentCount: events.length, associatedTotal: events.reduce((sum, event) => sum + event.total, 0), events };
  }).sort((a, b) => b.incidentCount - a.incidentCount || b.associatedTotal - a.associatedTotal || a.name.localeCompare(b.name));
}

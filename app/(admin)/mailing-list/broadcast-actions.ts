"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { parseRecipients, type BroadcastInput } from "@/lib/mailing-list/broadcast";
import { getBroadcast, prepareBroadcast, refreshBroadcast, saveBroadcast, saveGroup, sendBroadcast } from "@/lib/mailing-list/store";
import { loadBroadcastAnalytics } from "@/lib/mailing-list/analytics";

export async function saveMailingGroup(name: string, source: string, id: string, version?: string) {
  await requireAppAccess("mailing-list", "write");
  const parsed = parseRecipients(source);
  if (parsed.invalid.length) throw new Error(`Fix ${parsed.invalid.length} invalid entries before saving: ${parsed.invalid.slice(0, 3).join(", ")}`);
  const result = await saveGroup({ name, recipients: parsed.recipients }, id, version);
  revalidatePath("/mailing-list");
  return result;
}
export async function saveBroadcastDraft(input: BroadcastInput, id: string, version?: string) {
  await requireAppAccess("mailing-list", "write");
  const result = await saveBroadcast(input, id, version);
  revalidatePath("/mailing-list");
  return result;
}
export async function prepareMailingBroadcast(id: string, version: string) {
  await requireAppAccess("mailing-list", "write");
  if ((await getBroadcast(id)).newsletter_id) await requireAppAccess("nu-news", "write");
  const result = await prepareBroadcast(id, version);
  revalidatePath("/mailing-list");
  return result;
}
export async function sendMailingBroadcast(id: string, version: string, confirm: boolean) {
  await requireAppAccess("mailing-list", "write");
  const result = await sendBroadcast(id, version, confirm);
  revalidatePath("/mailing-list");
  return result;
}
export async function refreshMailingBroadcast(id: string) {
  await requireAppAccess("mailing-list", "write");
  const result = await refreshBroadcast(id);
  revalidatePath("/mailing-list");
  return result;
}
export async function getMailingBroadcastAnalytics(id: string) {
  await requireAppAccess("mailing-list");
  return loadBroadcastAnalytics(id);
}
export async function loadMailingBroadcast(id: string) {
  await requireAppAccess("mailing-list");
  return getBroadcast(id);
}

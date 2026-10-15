"use server";

import { revalidatePath } from "next/cache";
import { banPair, unbanPair, resetVotes } from "@/lib/rush-data";
import { requireAppAccess } from "@/lib/reimbursements/auth";

// Layouts don't wrap server-action POSTs — every action must check the role.

export async function banPairAction(formData: FormData) {
  await requireAppAccess("rush", "write");
  const ip = String(formData.get("ip") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!ip && !deviceId) return;
  await banPair(ip, deviceId);
  revalidatePath("/rush");
}

export async function unbanPairAction(formData: FormData) {
  await requireAppAccess("rush", "write");
  const ip = String(formData.get("ip") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!ip && !deviceId) return;
  await unbanPair(ip, deviceId);
  revalidatePath("/rush");
}

export async function resetVotesAction() {
  await requireAppAccess("rush", "write");
  await resetVotes();
  revalidatePath("/rush");
}

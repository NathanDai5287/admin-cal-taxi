"use server";

import { revalidatePath } from "next/cache";
import { banPair, unbanPair, resetVotes } from "@/lib/rush-data";

export async function banPairAction(formData: FormData) {
  const ip = String(formData.get("ip") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!ip && !deviceId) return;
  await banPair(ip, deviceId);
  revalidatePath("/rush");
}

export async function unbanPairAction(formData: FormData) {
  const ip = String(formData.get("ip") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!ip && !deviceId) return;
  await unbanPair(ip, deviceId);
  revalidatePath("/rush");
}

export async function resetVotesAction() {
  await resetVotes();
  revalidatePath("/rush");
}

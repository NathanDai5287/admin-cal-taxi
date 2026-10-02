"use server";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { createSigningLinks, listSigning, markSigningLinkSent, prepareSigning, reconcileSigning, syncSigning } from "@/lib/host-signing";
import type { SigningActivation } from "@/lib/host-signing";
import { revalidatePath } from "next/cache";

async function admin() { await requireAdmin("/"); }

export async function listSigningAction(orderId: string) {
  await admin();
  return listSigning(orderId);
}

export async function prepareSigningAction(orderId: string, payload: Record<string, unknown>, requestKey: string, expectedLatestRevisionId: string) {
  await admin();
  return prepareSigning(orderId, payload, requestKey, expectedLatestRevisionId);
}

export async function createSigningLinksAction(orderId: string, revisionId: string, hash: string, activation: SigningActivation) {
  await admin();
  const revision = await createSigningLinks(orderId, revisionId, hash, activation);
  revalidatePath(`/host/orders/${orderId}`);
  revalidatePath("/host/orders");
  return revision;
}

export async function syncSigningAction(orderId: string, revisionId: string) {
  await admin();
  const revision = await syncSigning(orderId, revisionId);
  revalidatePath(`/host/orders/${orderId}`);
  return revision;
}

export async function reconcileSigningAction(orderId: string, revisionId: string) {
  await admin();
  const revision = await reconcileSigning(orderId, revisionId);
  revalidatePath(`/host/orders/${orderId}`);
  return revision;
}

export async function markSigningLinkSentAction(orderId: string, revisionId: string, email: string, sent: boolean) {
  await admin();
  return markSigningLinkSent(orderId, revisionId, email, sent);
}

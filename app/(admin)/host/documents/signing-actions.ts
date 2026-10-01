"use server";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { createSigningLinks, listSigning, markSigningLinkSent, prepareSigning, reconcileSigning, syncSigning } from "@/lib/host-signing";

async function admin() { await requireAdmin("/"); }

export async function listSigningAction(orderId: string) {
  await admin();
  return listSigning(orderId);
}

export async function prepareSigningAction(orderId: string, payload: Record<string, unknown>, requestKey: string, expectedLatestRevisionId: string) {
  await admin();
  return prepareSigning(orderId, payload, requestKey, expectedLatestRevisionId);
}

export async function createSigningLinksAction(orderId: string, revisionId: string, hash: string) {
  await admin();
  return createSigningLinks(orderId, revisionId, hash);
}

export async function syncSigningAction(orderId: string, revisionId: string) {
  await admin();
  return syncSigning(orderId, revisionId);
}

export async function reconcileSigningAction(orderId: string, revisionId: string) {
  await admin();
  return reconcileSigning(orderId, revisionId);
}

export async function markSigningLinkSentAction(orderId: string, revisionId: string, email: string, sent: boolean) {
  await admin();
  return markSigningLinkSent(orderId, revisionId, email, sent);
}

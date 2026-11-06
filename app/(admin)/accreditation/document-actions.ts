"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { finishExampleUpload, loadDocumentLibrary, loadDocumentWorkspace, performDocumentRequest, processExampleStep, renameDocumentFamily, reserveExampleBatch, seedDocumentExample, startExampleDocument } from "@/lib/accreditation/document-store";

async function access(write = true) {
  if (!accreditationEnabled()) throw new Error("Accreditation is disabled.");
  return requireAppAccess("accreditation", write ? "write" : "read");
}
async function result<T>(operation: () => Promise<T>) {
  try {
    const data = await operation();
    revalidatePath("/accreditation", "layout");
    return { ok: true as const, data };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The operation failed. Your saved work is retained." };
  }
}
export async function reserveDocumentBatch(input: unknown) {
  const session = await access();
  return result(() => reserveExampleBatch(session.userId, input));
}
export async function completeDocumentUpload(id: string) {
  await access();
  return result(() => finishExampleUpload(id));
}
export async function processDocumentExample(id: string) {
  await access();
  return result(() => processExampleStep(id));
}
export async function refreshDocumentLibrary() {
  await access(false);
  return loadDocumentLibrary();
}
export async function refreshDocumentWorkspace(id: string) {
  await access(false);
  return loadDocumentWorkspace(id);
}
export async function beginExampleDocument(input: unknown) {
  const session = await access();
  return result(() => startExampleDocument(session.userId, input));
}
export async function updateDocumentFamily(input: unknown) {
  await access();
  return result(() => renameDocumentFamily(input));
}
export async function requestDocumentChange(input: unknown) {
  const session = await access();
  return result(() => performDocumentRequest(session.userId, input));
}
export async function createDocumentFromExisting(input: unknown) {
  const session = await access();
  return result(() => seedDocumentExample(session.userId, input));
}

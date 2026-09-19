"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { BatchCreateResult, BatchProcessResult } from "@/lib/accreditation/batch";
import { validateSourceFile } from "@/lib/accreditation/extract";
import { isRetryableAiError } from "@/lib/accreditation/gemini";
import { processDocument } from "@/lib/accreditation/processing";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { policyEnabled } from "@/lib/policy/server";

async function policyAdmin() {
  if (!policyEnabled()) throw new Error("Policy features are disabled.");
  return requireAdmin("/");
}
const metadata = z.object({ title: z.string().trim().min(1).max(200), authority: z.string().trim().min(1).max(200), document_type: z.enum(["policy", "bylaws", "rules", "guidelines"]), version_label: z.string().trim().min(1).max(100), effective_from: z.iso.date(), effective_until: z.union([z.iso.date(), z.literal("")]).transform((s) => s || null) }).refine((m) => !m.effective_until || m.effective_until >= m.effective_from);
function finish(message: string): never { revalidatePath("/policy", "layout"); redirect(`/policy/library?message=${encodeURIComponent(message)}`); }

export async function createPolicyBatchItem(form: FormData): Promise<BatchCreateResult> {
  const { userId } = await policyAdmin();
  const parsed = metadata.safeParse(Object.fromEntries(form));
  const file = form.get("file");
  if (!parsed.success || !(file instanceof File)) return { ok: false, message: "Provide shared policy metadata and a supported file." };
  try { validateSourceFile(file); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Use a supported document up to 25 MB." }; }
  if (form.get("signatureFree") !== "on") return { ok: false, message: "Confirm signatures and unnecessary personal information were removed." };
  const db = createAccreditationAdminClient();
  const id = crypto.randomUUID();
  const path = `${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await db.storage.from("policy-documents").upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploaded.error) return { ok: false, message: "Upload failed. Please retry this document." };
  const inserted = await db.from("policy_documents").insert({ id, ...parsed.data, content_hash: createHash("sha256").update(bytes).digest("hex"), storage_path: path, original_name: file.name, mime_type: file.type || "application/octet-stream", created_by: userId });
  if (inserted.error) {
    await db.storage.from("policy-documents").remove([path]);
    return { ok: false, message: "Policy could not be saved." };
  }
  revalidatePath("/policy/library");
  return { ok: true, id, message: "Uploaded. Waiting to embed." };
}

export async function processPolicyBatchItem(idValue: string): Promise<BatchProcessResult> {
  await policyAdmin();
  const id = z.string().uuid().safeParse(idValue);
  if (!id.success) return { ok: false, retryable: false, message: "The uploaded policy ID is invalid." };
  try {
    await processDocument(id.data, true, true);
    revalidatePath("/policy/library");
    return { ok: true, retryable: false, message: "Embedding complete. Review before publishing." };
  } catch (error) {
    revalidatePath("/policy/library");
    const retryable = isRetryableAiError(error);
    return { ok: false, retryable, message: retryable ? "Gemini is rate-limited or overloaded." : "Processing failed. Review the document error." };
  }
}

export async function uploadPolicy(form: FormData) {
  const { userId } = await policyAdmin();
  const parsed = metadata.safeParse(Object.fromEntries(form));
  const file = form.get("file");
  if (!parsed.success || !(file instanceof File)) finish("Provide the policy metadata and a supported file.");
  try { validateSourceFile(file); } catch { finish("Use a supported document up to 25 MB."); }
  if (form.get("signatureFree") !== "on") finish("Remove signatures and personal information before processing.");
  const db = createAccreditationAdminClient();
  const id = crypto.randomUUID();
  const path = `${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await db.storage.from("policy-documents").upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploaded.error) finish("Upload failed. Please retry.");
  const inserted = await db.from("policy_documents").insert({ id, ...parsed.data, content_hash: createHash("sha256").update(bytes).digest("hex"), storage_path: path, original_name: file.name, mime_type: file.type || "application/octet-stream", created_by: userId });
  if (inserted.error) { await db.storage.from("policy-documents").remove([path]); finish("Policy could not be saved."); }
  try { await processDocument(id, true, true); } catch { finish("Draft saved. Processing failed; review the error and reprocess."); }
  finish("Draft processed. Review the extracted passages before publishing.");
}

export async function editPolicy(form: FormData) {
  await policyAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const parsed = metadata.safeParse(Object.fromEntries(form));
  if (!parsed.success) finish("Check the policy metadata and dates.");
  const result = await createAccreditationAdminClient().from("policy_documents").update({ ...parsed.data, reviewed_at: null, reviewed_by: null }).eq("id", id).in("status", ["draft", "failed"]).select("id");
  finish(result.error || !result.data?.length ? "Only draft metadata may be edited." : "Metadata saved. Review before publishing.");
}

export async function reprocessPolicy(form: FormData) {
  await policyAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  try { await processDocument(id, true, form.get("signatureFree") === "on"); } catch { finish("Processing failed. Review the source error and retry later."); }
  finish("Draft processing complete.");
}

export async function publishPolicy(form: FormData) {
  const { userId } = await policyAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  if (form.get("reviewed") !== "on") finish("Review extracted text and locators before publishing.");
  const result = await createAccreditationAdminClient().from("policy_documents").update({ status: "published", reviewed_by: userId, reviewed_at: new Date().toISOString(), published_by: userId, published_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("id");
  finish(result.error || !result.data?.length ? "Publication requires complete extraction, embeddings, review, and metadata." : "Policy explicitly published.");
}

export async function retirePolicy(form: FormData) {
  const { userId } = await policyAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const status = z.enum(["archived", "superseded"]).parse(form.get("status"));
  const replacement = form.get("replacement_document_id");
  const replacementId = replacement ? z.string().uuid().parse(replacement) : null;
  const db = createAccreditationAdminClient();
  if (replacementId) {
    const existing = await db.from("policy_documents").select("id").eq("id", replacementId).eq("status", "published").maybeSingle();
    if (!existing.data || replacementId === id) finish("Choose a different published replacement.");
  }
  const result = await db.from("policy_documents").update({ status, replacement_document_id: replacementId, superseded_by: userId, superseded_at: new Date().toISOString() }).eq("id", id);
  finish(result.error ? "Policy status could not be changed." : "Policy removed from member retrieval.");
}

export async function deletePolicy(form: FormData) {
  await policyAdmin();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success || form.get("confirmDelete") !== "on") finish("Confirm permanent deletion first.");
  const db = createAccreditationAdminClient();
  const policy = await db.from("policy_documents").select("storage_path,status").eq("id", id.data).maybeSingle();
  if (!policy.data) finish("Policy document not found.");
  if (!["draft", "failed", "archived"].includes(policy.data.status)) finish("Published and superseded policies must be archived before permanent deletion.");
  const removed = await db.from("policy_documents").delete().eq("id", id.data).in("status", ["draft", "failed", "archived"]).select("id");
  if (removed.error || !removed.data?.length) finish("Policy is referenced by another record and could not be deleted.");
  const storage = await db.storage.from("policy-documents").remove([policy.data.storage_path]);
  finish(storage.error ? "Policy and embeddings deleted; original file cleanup failed." : "Policy, original file, and embeddings permanently deleted.");
}

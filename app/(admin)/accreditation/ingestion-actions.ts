"use server";
import { z } from "zod";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { processDocument } from "@/lib/accreditation/processing";
import { enqueueDocument, ingestionEnabled } from "@/lib/accreditation/ingestion";
export async function startDocumentProcessing(form: FormData) {
  const input = z.object({ sourceId: z.string().uuid(), type: z.enum(["policy", "accreditation"]), signatureFree: z.literal("on"), intent: z.enum(["resume", "embeddings"]).default("resume") }).safeParse(Object.fromEntries(form));
  if (!input.success) return { error: "Confirm this source and its text contain no signatures.", queued: false };
  await requireAppAccess(input.data.type, "write");
  try {
    if (input.data.intent === "embeddings") {
      if (!ingestionEnabled()) return { error: "Enable the resumable worker before regenerating embeddings.", queued: false };
      await enqueueDocument(input.data.sourceId, input.data.type === "policy", true, true);
      return { queued: true };
    }
    const result = await processDocument(input.data.sourceId, input.data.type === "policy", true);
    return { queued: Boolean(result?.queued) };
  } catch (error) { return { error: error instanceof Error ? error.message : "Processing unavailable.", queued: false }; }
}
export async function manageIngestion(form: FormData) {
  const input = z.object({ job: z.string().uuid(), type: z.enum(["policy", "accreditation"]), page: z.coerce.number().int().min(0).max(200) }).parse(Object.fromEntries(form));
  await requireAppAccess(input.type, "write");
  const db = createAccreditationAdminClient();
  const job = await db.from("document_ingestion_jobs").select("id").eq("id", input.job).not(input.type === "policy" ? "policy_id" : "evidence_id", "is", null).maybeSingle();
  if (!job.data) return { error: "Job not found." };
  const result = await db.rpc("ingestion_manage", { p_job: input.job, p_page: input.page || null });
  return result.error ? { error: result.error.message } : { ok: true };
}

export async function stopDocumentProcessing(form: FormData) {
  const input = z.object({ job: z.string().uuid(), type: z.enum(["policy", "accreditation"]) }).safeParse(Object.fromEntries(form));
  if (!input.success) return { error: "Invalid processing job." };
  await requireAppAccess(input.data.type, "write");
  const db = createAccreditationAdminClient();
  const result = await db.rpc("ingestion_stop", { p_job: input.data.job, p_policy: input.data.type === "policy" });
  if (result.error) return { error: result.error.message };
  return { status: String(result.data) };
}

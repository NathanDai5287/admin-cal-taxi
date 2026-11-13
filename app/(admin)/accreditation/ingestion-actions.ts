"use server";
import { z } from "zod";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
export async function manageIngestion(form: FormData) {
  const input = z.object({ job: z.string().uuid(), type: z.enum(["policy", "accreditation"]), page: z.coerce.number().int().min(0).max(200) }).parse(Object.fromEntries(form));
  await requireAppAccess(input.type, "write");
  const db = createAccreditationAdminClient();
  const job = await db.from("document_ingestion_jobs").select("id").eq("id", input.job).not(input.type === "policy" ? "policy_id" : "evidence_id", "is", null).maybeSingle();
  if (!job.data) return { error: "Job not found." };
  const result = await db.rpc("ingestion_manage", { p_job: input.job, p_page: input.page || null });
  return result.error ? { error: result.error.message } : { ok: true };
}

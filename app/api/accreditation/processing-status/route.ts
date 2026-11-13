import { z } from "zod";

import { accreditationEnabled } from "@/lib/accreditation/feature";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { policyEnabled } from "@/lib/policy/server";
import { getSessionProfile, hasAppAccess } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idsSchema = z.array(z.string().uuid()).min(1).max(20);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type !== "policy" && type !== "accreditation") return Response.json({ error: "Invalid document type" }, { status: 400 });
  if ((type === "policy" && !policyEnabled()) || (type === "accreditation" && !accreditationEnabled())) return Response.json({ error: "Not found" }, { status: 404 });
  const session = await getSessionProfile();
  if (!session || !hasAppAccess(session, type, "read")) return Response.json({ error: "Forbidden" }, { status: 403 });
  const ids = idsSchema.safeParse((url.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids.success) return Response.json({ error: "Invalid document IDs" }, { status: 400 });
  const table = type === "policy" ? "policy_documents" : "accreditation_sources";
  const statusColumns = type === "policy"
    ? "id,status,processing_state,processing_error,processing_completed,processing_total,processing_attempts"
    : "id,status,processing_error,processing_completed,processing_total,processing_attempts";
  const result = await createAccreditationAdminClient().from(table).select(statusColumns).in("id", ids.data);
  if (result.error) return Response.json({ error: "Progress is temporarily unavailable" }, { status: 500 });
  const db = createAccreditationAdminClient();
  const jobs = await db.from("document_ingestion_jobs").select("id,policy_id,evidence_id,status,stage,page_count,error,next_retry_at,progress_at").in(type === "policy" ? "policy_id" : "evidence_id", ids.data).order("created_at", { ascending: false });
  const documents = await Promise.all((result.data ?? []).map(async (row: { id: string }) => {
    const job = jobs.data?.find((j: { policy_id: string; evidence_id: string }) => (type === "policy" ? j.policy_id : j.evidence_id) === row.id);
    if (!job) return row;
    const [pages, chunks, embeddings] = await Promise.all([
      db.from("document_ingestion_pages").select("page", { count: "exact", head: true }).eq("job_id", job.id),
      db.from("document_ingestion_chunks").select("ordinal", { count: "exact", head: true }).eq("job_id", job.id),
      db.from("document_ingestion_chunks").select("ordinal", { count: "exact", head: true }).eq("job_id", job.id).not("embedding", "is", null),
    ]);
    const message = job.status === "complete" ? "Processing complete" : job.status === "cancelled" ? "Processing cancelled; saved document retained." : job.status === "paused" ? `Paused; progress saved. ${job.error?.message ?? ""}` : job.status === "waiting" ? `Waiting; progress saved. Retry after ${job.next_retry_at}` : job.stage === "extraction" ? `Reading PDF: ${pages.count ?? 0}/${job.page_count} pages` : job.stage === "embedding" ? `Creating embeddings: ${embeddings.count ?? 0}/${chunks.count ?? 0} passages` : `Processing: ${job.stage}`;
    return { ...row, ingestion_status: job.status, ingestion_message: message, ingestion_job: job, pages_completed: pages.count, processing_completed: embeddings.count ?? 0, processing_total: chunks.count ?? 0 };
  }));
  return Response.json({ documents }, { headers: { "Cache-Control": "private, no-store" } });
}

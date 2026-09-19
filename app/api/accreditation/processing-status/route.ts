import { z } from "zod";

import { accreditationEnabled } from "@/lib/accreditation/feature";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { policyEnabled } from "@/lib/policy/server";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idsSchema = z.array(z.string().uuid()).min(1).max(20);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type !== "policy" && type !== "accreditation") return Response.json({ error: "Invalid document type" }, { status: 400 });
  if ((type === "policy" && !policyEnabled()) || (type === "accreditation" && !accreditationEnabled())) return Response.json({ error: "Not found" }, { status: 404 });
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const ids = idsSchema.safeParse((url.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids.success) return Response.json({ error: "Invalid document IDs" }, { status: 400 });
  const table = type === "policy" ? "policy_documents" : "accreditation_sources";
  const statusColumns = type === "policy"
    ? "id,status,processing_state,processing_error,processing_completed,processing_total,processing_attempts"
    : "id,status,processing_error,processing_completed,processing_total,processing_attempts";
  const result = await createAccreditationAdminClient().from(table).select(statusColumns).in("id", ids.data);
  if (result.error) return Response.json({ error: "Progress is temporarily unavailable" }, { status: 500 });
  return Response.json({ documents: result.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

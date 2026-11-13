import { z } from "zod";

import { accreditationEnabled } from "@/lib/accreditation/feature";
import { loadProcessingStatus } from "@/lib/accreditation/processing-status";
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
  try {
    const documents = await loadProcessingStatus(ids.data, type === "policy");
    return Response.json({ documents }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Progress is temporarily unavailable" }, { status: 503 }); }
}

import { z } from "zod";

import {
  EVIDENCE_SEARCH_LIMIT,
  EVIDENCE_SOURCE_COLUMNS,
  type EvidenceSource,
} from "@/lib/accreditation/evidence-list";
import { accreditationEnabled } from "@/lib/accreditation/feature";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const searchSchema = z.object({
  cycleId: z.string().uuid(),
  query: z.string().trim().min(1).max(120),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  if (!accreditationEnabled()) return json({ error: "Evidence is unavailable." }, 404);
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") return json({ error: "Access denied." }, 403);

  const params = new URL(request.url).searchParams;
  const parsed = searchSchema.safeParse({
    cycleId: params.get("cycleId"),
    query: params.get("q"),
  });
  if (!parsed.success) return json({ error: "Enter a file name to search." }, 400);

  // ILIKE treats these characters as wildcards; file-name search uses them literally.
  const literalQuery = parsed.data.query.replace(/[\\%_]/g, "\\$&");
  const result = await createAccreditationAdminClient()
    .from("accreditation_sources")
    .select(EVIDENCE_SOURCE_COLUMNS, { count: "exact" })
    .eq("cycle_id", parsed.data.cycleId)
    .ilike("original_name", `%${literalQuery}%`)
    .order("created_at", { ascending: false })
    .limit(EVIDENCE_SEARCH_LIMIT);

  if (result.error) {
    console.error("Could not search accreditation evidence", result.error);
    return json({ error: "Search is temporarily unavailable. Try again." }, 500);
  }
  return json({ sources: (result.data ?? []) as EvidenceSource[], count: result.count ?? 0 });
}

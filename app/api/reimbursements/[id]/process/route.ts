import { after } from "next/server";

import { processReimbursementReceipt } from "@/lib/reimbursements/tabscanner";
import { createClient } from "@/lib/reimbursements/supabase/server";

export const maxDuration = 60;

export async function POST(_request: Request, context: RouteContext<"/api/reimbursements/[id]/process">) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: reimbursement } = await supabase
    .from("reimbursements")
    .select("id")
    .eq("id", id)
    .eq("status", "processing")
    .maybeSingle();
  if (!reimbursement) {
    return Response.json({ error: "Reimbursement not found" }, { status: 404 });
  }

  after(() => processReimbursementReceipt(id));
  return Response.json({ status: "processing" }, { status: 202 });
}

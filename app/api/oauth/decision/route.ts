import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }

  const formData = await request.formData();
  const authorizationId = formData.get("authorization_id");
  const decision = formData.get("decision");
  if (typeof authorizationId !== "string" || !["approve", "deny"].includes(String(decision))) {
    return NextResponse.json({ error: "Invalid authorization decision" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = decision === "approve"
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }
  return NextResponse.redirect(result.data.redirect_url);
}

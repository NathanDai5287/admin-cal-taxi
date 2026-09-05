import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { clearLegacyHostOnlyAuthCookies } from "@/lib/reimbursements/supabase/cookie-options";
import { createClient } from "@/lib/reimbursements/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  const response = NextResponse.redirect(new URL("/reimbursements/login", request.url), {
    status: 302,
  });
  clearLegacyHostOnlyAuthCookies(request, response);
  return response;
}

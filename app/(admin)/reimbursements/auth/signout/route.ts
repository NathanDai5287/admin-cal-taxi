import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { clearAuthCookies } from "@/lib/reimbursements/supabase/cookie-options";
import { createClient } from "@/lib/reimbursements/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Unconditional: gating on getClaims() skipped signOut whenever the token
  // could not be verified, leaving the session cookie in place.
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  const response = NextResponse.redirect(new URL("/reimbursements/login", request.url), {
    status: 302,
  });
  clearAuthCookies(request, response);
  return response;
}

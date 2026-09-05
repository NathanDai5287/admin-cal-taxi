import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { reimbursementCookieOptions } from "@/lib/reimbursements/supabase/cookie-options";
import { hasSupabaseConfig, getSupabaseConfig } from "@/lib/reimbursements/supabase/config";

// Refreshes the Supabase session cookie on every request to an auth-gated
// part of the site. `createResponse` lets the caller decide the base response
// (plain pass-through vs. a rewrite for the submit host); when the session is
// refreshed the response is recreated through the same factory so refreshed
// cookies reach both the browser and the downstream server components.
export async function updateReimbursementSession(
  request: NextRequest,
  createResponse: (req: NextRequest) => NextResponse = (req) =>
    NextResponse.next({ request: req }),
) {
  if (!hasSupabaseConfig()) {
    return createResponse(request);
  }

  const { url, publishableKey } = getSupabaseConfig();
  let response = createResponse(request);

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: reimbursementCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = createResponse(request);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

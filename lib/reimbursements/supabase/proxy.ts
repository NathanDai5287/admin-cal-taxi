import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/reimbursements/supabase/database.types";
import { getCookieOptions } from "@/lib/reimbursements/supabase/cookie-options";
import { hasSupabaseConfig, getSupabaseConfig } from "@/lib/reimbursements/supabase/config";
import { VIEW_AS_COOKIE, VIEW_AS_HEADER } from "@/lib/app-access";
import { routeAccess, type RouteAccess } from "@/lib/route-access";

// Refreshes the Supabase session cookie, then lets the request through only
// when the route registry allows the signed-in person to open `appPath`.
// `createResponse` lets the caller decide the base response (plain
// pass-through vs. a rewrite for the submit host); when the session is
// refreshed the response is recreated through the same factory so refreshed
// cookies reach both the browser and the downstream server components.
export async function updateSession(
  request: NextRequest,
  appPath: string,
  loginPath: string,
  createResponse: (req: NextRequest) => NextResponse = (req) =>
    NextResponse.next({ request: req }),
) {
  const access = routeAccess(appPath);
  if (!access) return new NextResponse("Not found", { status: 404 });
  if (!hasSupabaseConfig()) {
    return createResponse(request);
  }

  const { url, publishableKey } = getSupabaseConfig();
  let response = createResponse(request);
  const viewAsRole = request.cookies.get(VIEW_AS_COOKIE)?.value;

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: getCookieOptions(),
    global: { headers: viewAsRole ? { [VIEW_AS_HEADER]: viewAsRole } : {} },
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

  const { data } = await supabase.auth.getClaims();
  if (access === "public") return response;
  if (!data?.claims?.sub) return deny(request, loginPath, 401);
  if (access === "signed-in" || await canOpen(supabase, access)) return response;
  return deny(request, "/no-access", 403);
}

async function canOpen(supabase: ReturnType<typeof createServerClient<Database>>, apps: Exclude<RouteAccess, string>) {
  const { data } = await supabase.rpc("get_my_app_access");
  return (data ?? []).some(({ app_key, access_level }) => apps.some((app) => app === app_key) && access_level !== "none");
}

function deny(request: NextRequest, pagePath: string, apiStatus: number) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: apiStatus === 401 ? "Sign in first." : "Forbidden" }, { status: apiStatus });
  }
  const url = request.nextUrl.clone();
  url.pathname = pagePath;
  url.search = apiStatus === 401 ? `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}` : "";
  return apiStatus === 401 ? NextResponse.redirect(url) : NextResponse.rewrite(url);
}

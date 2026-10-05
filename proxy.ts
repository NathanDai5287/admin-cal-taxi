import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { publicSitePath } from "@/lib/public-site-routing";
import { updateSession } from "@/lib/reimbursements/supabase/proxy";

// Google sign-in is used on every host. This proxy only refreshes the
// Supabase session cookie and maps the member submission host onto the
// submit app. Role checks live in layouts and server code, not here.
// Compared by hostname only, so any local dev port works.
const SUBMIT_HOSTNAMES = new Set([
  "reimbursements.cal.taxi",
  "reimbursements.localhost",
]);

const PUBLIC_HOSTNAMES = new Set([
  "cal.taxi",
  "www.cal.taxi",
  "cal.localhost",
]);

export default async function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/email-tracking/")) return NextResponse.next();

  if (PUBLIC_HOSTNAMES.has(hostname)) {
    const publicPath = publicSitePath(pathname);
    if (publicPath) {
      const url = request.nextUrl.clone();
      url.pathname = publicPath;
      return NextResponse.rewrite(url);
    }
    if (
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/site/") ||
      pathname === "/icon.png" ||
      pathname === "/favicon.ico"
    ) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/public-site${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (SUBMIT_HOSTNAMES.has(hostname) && !(pathname === "/policy" || pathname.startsWith("/policy/") || pathname.startsWith("/api/policy/"))) {
    if (
      pathname.startsWith("/_next") ||
      pathname === "/icon.png" ||
      pathname === "/favicon.ico" ||
      pathname === "/taxi-icon.png"
    ) {
      return NextResponse.next();
    }
    // Mount the submit app at the host root: / → /submit, /login →
    // /submit/login, /auth/callback → /submit/auth/callback, and so on.
    // Unknown paths land on the app's catch-all, which bounces back to /.
    const url = request.nextUrl.clone();
    url.pathname = `/submit${pathname === "/" ? "" : pathname}`;
    return updateSession(request, (req) =>
      NextResponse.rewrite(url, { request: req }),
    );
  }

  // Machine-to-machine endpoint performs its own constant-time secret check.
  if (pathname === "/api/webhooks/reimbursements" || pathname.startsWith("/api/mcp")) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: "/:path*",
};

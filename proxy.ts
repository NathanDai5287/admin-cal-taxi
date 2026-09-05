import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { updateReimbursementSession } from "@/lib/reimbursements/supabase/proxy";

// The member submission site serves the submit app at its root and nothing
// else. It uses Supabase sign-in (member role) instead of the site-wide
// Basic Auth below. Compared by hostname only, so any local dev port works.
const SUBMIT_HOSTNAMES = new Set([
  "reimbursements.cal.taxi",
  "reimbursements.localhost",
]);

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin.cal.taxi"' },
  });
}

export default async function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const { pathname } = request.nextUrl;

  if (SUBMIT_HOSTNAMES.has(hostname)) {
    if (pathname.startsWith("/_next") || pathname === "/icon.png" || pathname === "/favicon.ico") {
      return NextResponse.next();
    }
    // Mount the submit app at the host root: / → /submit, /login →
    // /submit/login, and so on. Unknown paths land on the app's catch-all,
    // which bounces back to /.
    const url = request.nextUrl.clone();
    url.pathname = `/submit${pathname === "/" ? "" : pathname}`;
    return updateReimbursementSession(request, (req) =>
      NextResponse.rewrite(url, { request: req }),
    );
  }

  // Supabase cannot answer the site's interactive Basic Auth challenge. This
  // machine-to-machine endpoint performs its own constant-time secret check.
  if (pathname === "/api/webhooks/reimbursements") {
    return NextResponse.next();
  }

  // The reimbursements review app uses Supabase sign-in (admin role) rather
  // than Basic Auth. Layouts and server actions enforce the role; the proxy
  // just keeps the session cookie fresh.
  if (pathname.startsWith("/reimbursements")) {
    return updateReimbursementSession(request);
  }

  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const expectedPass = process.env.ADMIN_PASSWORD;

  // Lock everyone out if no password has been configured, rather than
  // silently allowing access.
  if (!expectedPass) return unauthorized();

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (user !== expectedUser || pass !== expectedPass) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};

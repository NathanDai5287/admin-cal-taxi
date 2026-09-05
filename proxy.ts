import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The public submission site serves the submit page at its root and nothing
// else. It intentionally skips the site-wide Basic Auth below.
const SUBMIT_HOSTS = new Set([
  "reimbursements.cal.taxi",
  "reimbursements.localhost:3000",
]);

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin.cal.taxi"' },
  });
}

export default function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { pathname } = request.nextUrl;

  if (SUBMIT_HOSTS.has(host)) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/submit", request.url));
    }
    if (pathname.startsWith("/_next") || pathname === "/icon.png" || pathname === "/favicon.ico") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Supabase cannot answer the site's interactive Basic Auth challenge. This
  // machine-to-machine endpoint performs its own constant-time secret check.
  if (pathname === "/api/webhooks/reimbursements") {
    return NextResponse.next();
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

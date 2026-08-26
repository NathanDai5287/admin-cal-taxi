import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { updateReimbursementSession } from "@/lib/reimbursements/supabase/proxy";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin.cal.taxi"' },
  });
}

export default async function proxy(request: NextRequest) {
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

  return updateReimbursementSession(request);
}

export const config = {
  matcher: "/:path*",
};

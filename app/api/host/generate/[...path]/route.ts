import { NextResponse, type NextRequest } from "next/server";

import { getSessionProfile } from "@/lib/reimbursements/auth";
import { BackendConfigError, backendKey, backendOrigin } from "@/lib/host-backend";

// Browser calls to /api/host/generate/* are proxied to the Flask PDF backend.
// This used to be a bare next.config rewrite covered by site-wide Basic Auth;
// with Basic Auth gone it must check the admin role itself.
//
// The backend requires the shared admin key on every generate route. The key
// is added here, server-side — it is never shipped to the browser.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { path } = await params;
  if (path.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    return NextResponse.json({ error: "bad_path" }, { status: 400 });
  }

  // The backend itself caps bodies at 256KB; refuse early so a huge POST
  // isn't buffered into this route's memory first.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512 * 1024) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let origin: string | null;
  try {
    origin = backendOrigin();
  } catch (err) {
    if (err instanceof BackendConfigError) {
      return NextResponse.json({ error: "backend_misconfigured" }, { status: 500 });
    }
    throw err;
  }
  const key = backendKey();
  if (!origin || !key) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${origin}/api/generate/${path.join("/")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": key },
      body: await request.text(),
      cache: "no-store",
      // Typst compiles can take a while, but not forever.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    console.error("host generate proxy upstream failure:", err);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }

  // Pass the PDF (or JSON error) through, preserving the download filename.
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

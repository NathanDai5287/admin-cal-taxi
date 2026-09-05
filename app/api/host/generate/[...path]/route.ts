import { NextResponse, type NextRequest } from "next/server";

import { getSessionProfile } from "@/lib/reimbursements/auth";

// Browser calls to /api/host/generate/* are proxied to the Flask PDF backend.
// This used to be a bare next.config rewrite covered by site-wide Basic Auth;
// with Basic Auth gone it must check the admin role itself.

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
  if (path.some((segment) => segment.includes("..") || segment.includes("/"))) {
    return NextResponse.json({ error: "bad_path" }, { status: 400 });
  }

  const origin = process.env.HOST_BACKEND_ORIGIN;
  if (!origin) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 500 });
  }

  const upstream = await fetch(`${origin}/api/generate/${path.join("/")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });

  // Pass the PDF (or JSON error) through, preserving the download filename.
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

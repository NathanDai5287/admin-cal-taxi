import { NextResponse } from "next/server";

import { createClient } from "@/lib/reimbursements/supabase/server";

// Only same-origin absolute paths: "//evil.com" is protocol-relative and
// "/\evil.com" is treated as protocol-relative by some browsers.
function safeNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return "/";
}

const MEMBER_HOSTNAMES = new Set(["reimbursements.cal.taxi", "reimbursements.localhost"]);

// The proxy rewrites /auth/callback to /submit/auth/callback, and in local
// development the rewritten request.url reports the server's own host
// (localhost:3000, the admin site) rather than reimbursements.localhost.
// Redirecting there drops the host-only session cookie that was just set.
// Use the host the browser actually requested, but only for known member
// hostnames so a forged Host header cannot turn this into an open redirect.
function memberOrigin(request: Request) {
  const fallback = new URL(request.url);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase();
  const hostname = host.split(":", 1)[0];
  if (!MEMBER_HOSTNAMES.has(hostname)) return fallback.origin;
  const protocol = hostname.endsWith(".localhost") ? fallback.protocol : "https:";
  return `${protocol}//${host}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = memberOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

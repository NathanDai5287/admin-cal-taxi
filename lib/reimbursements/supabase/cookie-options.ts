import type { NextRequest, NextResponse } from "next/server";

const FOUR_HUNDRED_DAYS_IN_SECONDS = 400 * 24 * 60 * 60;

// Only the production deployment shares a cookie domain. Server code checks
// Vercel's system env; in the browser VERCEL_ENV is not exposed to client
// bundles, so detect by the host the page is actually served from. (Keying
// off NEXT_PUBLIC_SITE_URL would also match local .env files copied from
// .env.example and break localhost sign-in with Secure cookies scoped to
// the wrong domain.)
function isSharedProductionDomain() {
  if (typeof window !== "undefined") {
    return window.location.hostname.endsWith("cal.taxi");
  }
  return process.env.VERCEL_ENV === "production";
}

// In production the session cookie is scoped to `.cal.taxi` so admin.cal.taxi
// and reimbursements.cal.taxi share a sign-in. Local development and preview
// deployments stay host-only so HTTP localhost still works.
export function getCookieOptions() {
  if (isSharedProductionDomain()) {
    return {
      path: "/",
      sameSite: "lax" as const,
      secure: true,
      maxAge: FOUR_HUNDRED_DAYS_IN_SECONDS,
      domain: ".cal.taxi",
    };
  }

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: false,
    maxAge: FOUR_HUNDRED_DAYS_IN_SECONDS,
  };
}

// Before starting a new browser sign-in, remove only host-scoped remnants
// from older deployments. A stale cookie with the same name can otherwise
// shadow the current shared `.cal.taxi` session. Omitting Domain deliberately
// leaves the shared cookie untouched.
export function clearLegacyHostOnlyAuthCookies() {
  if (typeof document === "undefined") return;

  const names = new Set(
    document.cookie
      .split(";")
      .map((part) => part.trim().split("=", 1)[0])
      .filter((name) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name)),
  );
  for (const name of names) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${
      window.location.protocol === "https:" ? "; Secure" : ""
    }`;
  }
}

// Sign-out must expire every variant of the session cookie: deletion matches
// on name + domain + path, and both host-only cookies (pre-unification and
// local dev) and the shared `.cal.taxi` cookie may be present. Clearing only
// one variant leaves a stale session behind.
export function clearAuthCookies(request: NextRequest, response: NextResponse) {
  const shared = isSharedProductionDomain();
  for (const { name } of request.cookies.getAll()) {
    if (/^sb-.*-auth-token/.test(name)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
      if (shared) {
        response.cookies.set(name, "", { path: "/", maxAge: 0, domain: ".cal.taxi" });
      }
    }
  }
}

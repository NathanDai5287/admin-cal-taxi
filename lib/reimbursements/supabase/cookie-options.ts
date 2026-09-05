import type { NextRequest, NextResponse } from "next/server";

const FOUR_HUNDRED_DAYS_IN_SECONDS = 400 * 24 * 60 * 60;

// Only the production deployment shares a cookie domain. Keying this off
// NEXT_PUBLIC_SITE_URL would also match local .env files copied from
// .env.example (which points at admin.cal.taxi for Discord links) and break
// localhost sign-in with Secure cookies scoped to the wrong domain.
function isSharedProductionDomain() {
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

// Sign-out must also expire pre-unification host-only session cookies:
// cookie deletion matches name + domain + path, and the old cookies were set
// without a domain, so clearing only the `.cal.taxi` variant would leave a
// stale session behind on whichever host it was created.
export function clearLegacyHostOnlyAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  for (const { name } of request.cookies.getAll()) {
    if (/^sb-.*-auth-token/.test(name)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  }
}

const FOUR_HUNDRED_DAYS_IN_SECONDS = 400 * 24 * 60 * 60;

function isSharedProductionDomain() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    process.env.VERCEL_ENV === "production" || siteUrl.includes("cal.taxi")
  );
}

// In production the session cookie is scoped to `.cal.taxi` so admin.cal.taxi
// and reimbursements.cal.taxi share a sign-in. Local development stays
// host-only so HTTP localhost still works.
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

const FOUR_HUNDRED_DAYS_IN_SECONDS = 400 * 24 * 60 * 60;

// Keep sessions host-only so the submit site (reimbursements.cal.taxi) and the
// review app (admin.cal.taxi) remember their own sign-ins independently.
// Secure cookies are used in production; localhost remains usable over HTTP in dev.
export const reimbursementCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: FOUR_HUNDRED_DAYS_IN_SECONDS,
};

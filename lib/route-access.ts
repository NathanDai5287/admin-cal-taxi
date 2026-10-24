import type { AppKey } from "@/lib/app-access";

export type RouteAccess = "public" | "signed-in" | AppKey[];

const ROUTE_ACCESS: Record<string, RouteAccess> = {
  "/_next": "public",
  "/__nextjs_original-stack-frames": "public",
  "/__nextjs_source-map": "public",
  "/icon.png": "public",
  "/favicon.ico": "public",
  "/taxi-icon.png": "public",
  "/fonts": "public",
  "/site": "public",
  "/demo": "public",
  "/public-site": "public",
  "/auth": "public",
  "/reimbursements/login": "public",
  "/reimbursements/auth": "public",
  "/submit/login": "public",
  "/submit/auth": "public",
  "/host/signing/copy": "public",
  "/api/host/signing/completed-copy": "public",
  "/api/host/signing/webhook": "public",
  "/api/webhooks/reimbursements": "public",
  "/api/email-tracking": "public",
  "/api/mcp": "public",

  "/": "signed-in",
  "/no-access": "signed-in",

  "/accreditation": ["accreditation"],
  "/ask-policy": ["ask-policy"],
  "/connections": ["connections"],
  "/oauth": ["connections"],
  "/api/oauth": ["connections"],
  "/email-activity": ["host"],
  "/finance": ["finance"],
  "/host": ["host"],
  "/mailing-list": ["mailing-list"],
  "/nu-news": ["nu-news"],
  "/policy": ["policy"],
  "/roles": ["roles"],
  "/rush": ["rush"],
  "/submit": ["submit"],
  "/users": ["users"],
  "/api/accreditation": ["accreditation"],
  "/api/accreditation/ask": ["ask-policy"],
  "/api/accreditation/evidence": ["accreditation", "ask-policy"],
  "/api/accreditation/sources": ["accreditation", "ask-policy"],
  "/api/accreditation/processing-status": ["accreditation", "policy"],
  "/api/policy/sources": ["accreditation", "ask-policy", "policy"],
  "/api/finance": ["finance"],
  "/api/host": ["host"],
  "/api/reimbursements/receipts": ["finance"],
};

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function routeAccess(pathname: string): RouteAccess | undefined {
  const prefix = Object.keys(ROUTE_ACCESS)
    .filter((candidate) => matches(pathname, candidate))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? ROUTE_ACCESS[prefix] : undefined;
}

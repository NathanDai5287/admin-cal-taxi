import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dues", destination: "/finance/accounts/receivable", permanent: false },
      { source: "/reimbursements", destination: "/finance/accounts/payable", permanent: false },
      { source: "/reimbursements/budgets", destination: "/finance/planning", permanent: false },
      { source: "/reimbursements/reports", destination: "/finance/reports", permanent: false },
      { source: "/reimbursements/reports/:path+", destination: "/finance/reports/:path+", permanent: false },
      { source: "/reimbursements/:id([0-9a-f-]{36})", destination: "/finance/accounts/payable/:id", permanent: false },
    ];
  },
  experimental: {
    // Accreditation evidence/templates are validated at 25 MB in their
    // authenticated server actions. Leave a small multipart overhead margin.
    serverActions: { bodySizeLimit: "30mb" },
    // Prefetched authenticated route payloads remain usable in the browser for
    // ten minutes. Mutations still invalidate the affected routes explicitly.
    staleTimes: { dynamic: 600, static: 600 },
  },
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["@myriaddreamin/typst-ts-node-compiler"],
  outputFileTracingIncludes: { "/*": ["./lib/host-pdf/**/*"] },
  // /api/host/generate/* is proxied by app/api/host/generate/[...path]/route.ts
  // (a route handler, not a rewrite) so it can enforce the admin role first.
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dues", destination: "/finance/accounts/receivable", permanent: false },
      { source: "/reimbursements", destination: "/finance/review", permanent: false },
      { source: "/reimbursements/budgets", destination: "/finance/planning", permanent: false },
      { source: "/reimbursements/reports", destination: "/finance/reports", permanent: false },
      { source: "/reimbursements/reports/:path+", destination: "/finance/reports/:path+", permanent: false },
      { source: "/reimbursements/:id([0-9a-f-]{36})", destination: "/finance/review/:id", permanent: false },
    ];
  },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["@myriaddreamin/typst-ts-node-compiler"],
  // /api/host/generate/* is proxied by app/api/host/generate/[...path]/route.ts
  // (a route handler, not a rewrite) so it can enforce the admin role first.
};

export default nextConfig;

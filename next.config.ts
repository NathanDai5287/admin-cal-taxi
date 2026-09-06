import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  serverExternalPackages: ["@myriaddreamin/typst-ts-node-compiler"],
  // /api/host/generate/* is proxied by app/api/host/generate/[...path]/route.ts
  // (a route handler, not a rewrite) so it can enforce the admin role first.
};

export default nextConfig;

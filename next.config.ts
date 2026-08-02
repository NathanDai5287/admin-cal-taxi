import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  async rewrites() {
    return [
      {
        source: "/api/host/generate/:path*",
        destination: `${process.env.HOST_BACKEND_ORIGIN}/api/generate/:path*`,
      },
    ];
  },
};

export default nextConfig;

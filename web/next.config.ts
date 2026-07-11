import type { NextConfig } from "next";

// Static export served by nginx at /app (preview) — zero runtime, no Node server.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/app",
  trailingSlash: true,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;

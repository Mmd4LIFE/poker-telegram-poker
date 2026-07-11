import type { NextConfig } from "next";

// Static export served by nginx at the site root — zero runtime, no Node server.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip type checking on Vercel — tsc crashes on the 8GB build machine
  typescript: {
    ignoreBuildErrors: true,
  },
  // Increase timeout for the briefing endpoint which calls Claude multiple times
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

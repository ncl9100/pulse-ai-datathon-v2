import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase timeout for the briefing endpoint which calls Claude multiple times
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

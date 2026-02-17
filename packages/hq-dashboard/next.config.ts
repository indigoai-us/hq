import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server actions to read from the local filesystem
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;

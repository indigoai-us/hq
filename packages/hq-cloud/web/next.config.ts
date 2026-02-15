import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required for monorepo deployment on Vercel:
  // Tells Next.js where the workspace root is so it can trace dependencies correctly
  outputFileTracingRoot: path.join(__dirname, "../../.."),
};

export default nextConfig;

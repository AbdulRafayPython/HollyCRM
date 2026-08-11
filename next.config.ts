import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets `next build` run while `next dev` is serving: both default to .next,
  // and sharing it corrupts whichever finishes second. CI/verification builds
  // set NEXT_DIST_DIR to keep out of the dev server's directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Webhook payloads are small; keep the body limit tight.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

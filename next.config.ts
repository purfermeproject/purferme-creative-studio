import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photos are shrunk in the browser first (ImageFileInput); this leaves room for big cut-out PNGs
    // while staying under Vercel's 4.5 MB request limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

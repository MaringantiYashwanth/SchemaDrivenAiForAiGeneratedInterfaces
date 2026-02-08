import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Stub optional peer deps from @standard-community/standard-json
  // Use Turbopack aliases (Next.js 16+) and keep webpack for non-turbo builds.
  turbopack: {
    resolveAlias: {
      effect: "src/lib/empty-module.js",
      sury: "src/lib/empty-module.js",
      "@valibot/to-json-schema": "src/lib/empty-module.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      effect: path.resolve(__dirname, "src/lib/empty-module.js"),
      sury: path.resolve(__dirname, "src/lib/empty-module.js"),
      "@valibot/to-json-schema": path.resolve(__dirname, "src/lib/empty-module.js"),
    };
    return config;
  },
};

export default nextConfig;

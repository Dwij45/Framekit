import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@framekit/db", "@framekit/shared", "@framekit/storage"],
  serverExternalPackages: ["@prisma/client", "ioredis", "bullmq"],
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;

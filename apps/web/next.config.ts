import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@framekit/db", "@framekit/shared"],
  serverExternalPackages: ["@prisma/client", "ioredis"],
};

export default nextConfig;

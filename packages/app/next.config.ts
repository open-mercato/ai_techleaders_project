import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
  // Workspace packages are shipped as TypeScript source; Next transpiles them.
  transpilePackages: ["@devmentor/core", "@devmentor/db", "@devmentor/ui"],
  // Keep the ORM and its driver out of the bundle — they are Node-only and rely on
  // dynamic requires that must not be bundled.
  serverExternalPackages: [
    "@mikro-orm/core",
    "@mikro-orm/postgresql",
    "@mikro-orm/migrations",
    "@mikro-orm/seeder",
    "pino",
  ],
};

export default nextConfig;

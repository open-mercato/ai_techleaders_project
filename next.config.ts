import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
  // MikroORM builds entity metadata at runtime and must not be bundled: doing so
  // breaks it inside Server Components with "Cannot read properties of undefined
  // (reading 'filter')". Marking these external makes the server require them
  // from node_modules instead.
  serverExternalPackages: [
    "@mikro-orm/core",
    "@mikro-orm/postgresql",
    "@mikro-orm/sql",
    "@mikro-orm/migrations",
  ],
};

export default nextConfig;

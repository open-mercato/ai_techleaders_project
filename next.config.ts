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
  experimental: {
    // Production server stacks are minified to single-letter frames. The
    // integration job turns this on so a 500 in a Server Component reports real
    // file names. Must be set for the build as well as the run.
    serverSourceMaps: process.env.NEXT_SERVER_SOURCE_MAPS === "1",
  },
};

export default nextConfig;

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: a real Postgres container, a real production build of the
// app, and a real browser. Requires Docker and `npm run build` beforehand.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.spec.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // One app instance and one database are shared by every spec, so files must
    // not run concurrently or they would clobber each other's rows.
    fileParallelism: false,
    // Pulling an image and booting Chrome is slow; the defaults are far too tight.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    teardownTimeout: 60_000,
    globals: false,
  },
});

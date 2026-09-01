import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only: fast, no I/O, no database, no browser.
// The integration suite has its own config (vitest.integration.config.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
  },
});

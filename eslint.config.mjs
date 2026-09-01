import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Dependency-direction guardrails. The allowed graph is:
 *
 *   app ──> core ──> db
 *    └────> ui
 *
 * Each package forbids importing the workspaces it must not depend on, so a
 * cycle-introducing import fails lint (acceptance criterion #9).
 */
const boundary = (files, forbidden) => ({
  files,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: forbidden.map((name) => ({
          group: [name, `${name}/*`],
          message: `Dependency-direction violation: this package must not import ${name}.`,
        })),
      },
    ],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: "packages/app" },
    },
  },
  // ui is presentational — no domain/data imports.
  boundary(["packages/ui/**/*.{ts,tsx}"], [
    "@devmentor/core",
    "@devmentor/db",
    "@devmentor/app",
  ]),
  // db is the leaf — knows nothing about the rest.
  boundary(["packages/db/**/*.{ts,tsx}"], [
    "@devmentor/core",
    "@devmentor/ui",
    "@devmentor/app",
  ]),
  // core may use db, but not the UI or the host app.
  boundary(["packages/core/**/*.{ts,tsx}"], ["@devmentor/ui", "@devmentor/app"]),
  globalIgnores([
    ".next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts",
    "packages/db/migrations/**",
  ]),
]);

export default eslintConfig;

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
 *
 * The same lists also carry the **third-party** boundaries, because a package's
 * `no-restricted-imports` must be configured once: flat config merges by rule name, so a
 * second config object naming the same files and the same rule replaces the first one's
 * patterns rather than adding to them, and the workspace rules would silently disappear.
 */
const workspaceMessage = (name) =>
  `Dependency-direction violation: this package must not import ${name}.`;

/**
 * Why a framework import is a boundary violation, per forbidden package.
 *
 * `core` and `db` are framework-free by design: `core/src/http/auth.ts` takes a plain
 * `Request` so the same guard serves a route handler and a page, `db` is the leaf, and
 * neither renders anything. `ui` may use `react` — it is a component library — but not
 * `next`, which is what keeps it renderable in Storybook and forces `AppShell` to take
 * `nav` as a `ReactNode` slot instead of reaching for `next/link`.
 */
const thirdPartyMessage = (name) =>
  name === "next"
    ? "Boundary violation: this package must not import next. The next/headers cookie " +
      "read and every redirect() live in packages/app/src/lib/session.ts; anything else " +
      "that needs the request takes a plain Request."
    : `Boundary violation: this package must not import ${name}. It renders nothing and ` +
      "must stay usable from a script, a seeder and a test with no renderer.";

const boundary = (files, forbidden) => ({
  files,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: forbidden.map((name) => ({
          // `${name}/*` catches the subpaths — `next/headers`, `next/navigation`,
          // `react/jsx-runtime` — which are the imports that would actually be written.
          group: [name, `${name}/*`],
          message: name.startsWith("@devmentor/")
            ? workspaceMessage(name)
            : thirdPartyMessage(name),
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
  // ui is presentational — no domain/data imports, and no framework. `react` is allowed:
  // it is a React component library.
  boundary(["packages/ui/**/*.{ts,tsx}"], [
    "@devmentor/core",
    "@devmentor/db",
    "@devmentor/app",
    "next",
  ]),
  // ...which makes `no-html-link-for-pages` unsatisfiable inside `packages/ui`: the rule's
  // fix is `next/link`, and the boundary directly above forbids importing it. The two rules
  // were in silent contradiction until a `<a href="/sessions">` in a shell test collided with
  // the new `/sessions/[bookingId]` page (#26) and turned it into a lint error with no legal
  // fix. An `<a>` in this package is the deliberate design — `AppShell`'s `nav` is a
  // `ReactNode` slot precisely so the host renders the `<Link>`s.
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  // db is the leaf — knows nothing about the rest, and nothing about rendering.
  boundary(["packages/db/**/*.{ts,tsx}"], [
    "@devmentor/core",
    "@devmentor/ui",
    "@devmentor/app",
    "next",
    "react",
  ]),
  // core may use db, but not the UI, the host app, or a framework.
  boundary(["packages/core/**/*.{ts,tsx}"], [
    "@devmentor/ui",
    "@devmentor/app",
    "next",
    "react",
  ]),
  globalIgnores([
    ".next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "**/storybook-static/**",
    "packages/ui/.storybook/public/prototypes/**",
    "packages/ui/.storybook/public/mockServiceWorker.js",
    "coverage/**",
    "test-results/**",
    "**/next-env.d.ts",
    "packages/db/migrations/**",
  ]),
]);

export default eslintConfig;

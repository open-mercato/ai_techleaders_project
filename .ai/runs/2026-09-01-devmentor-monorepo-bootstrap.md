# Run log — DevMentor monorepo bootstrap

Date: 2026-09-01
Spec: `.ai/specs/implemented/2026-09-01-devmentor-monorepo-bootstrap.md`

## Requested

Initialise the DevMentor project on the latest Next.js + TypeScript + React as an
npm-workspaces monorepo: PostgreSQL + MikroORM (migrations, pooling), awilix for DI,
Tailwind for public pages, shadcn-ui for admin pages, minimum an `app` integration
package. Also author `AGENTS.md` with the stack assumptions and add architecture
notes to `README.md`.

## Done

- Restructured the root `create-next-app` seed into `packages/{app,core,db,ui}` npm
  workspaces with a one-way dependency graph (`app → core → db`, `app → ui`).
- **`@devmentor/db`**: MikroORM v7 (`defineEntity`) config with explicit connection
  pooling, `User` 1:1 `MentorProfile` entities as `globalThis` singletons, a lazy
  connecting/HMR-safe `getOrm()` + `checkDbConnection()`, migrations wired to the CLI,
  and a default seeder.
- **`@devmentor/core`**: zod-validated env, pino logger, awilix container (`PROXY`,
  typed `Cradle`, singleton vs scoped lifetimes), `withScope()` helper, `UserService`.
- **`@devmentor/ui`**: `cn()`, shadcn `Button`/`Card`, oklch design tokens, committed
  `components.json`.
- **`@devmentor/app`**: Tailwind public landing page, shadcn admin layout + dashboard
  + users page (reads through the DI container / forked EM), `/api/health`.
  `transpilePackages` + `serverExternalPackages` configured; `build`/`start` force
  `NODE_ENV=production`.
- ESLint dependency-direction guardrails; `.env.example`; `docker-compose.yml` (Postgres 17).
- Generated + applied the initial migration and seeded a sample mentor.
- Wrote stack/architecture docs into `AGENTS.md` and `README.md`; recorded lessons.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build` — all green; build succeeds
  with **no database** running.
- Live dev server: `/` (Tailwind), `/admin` (shadcn, "Connected"), `/admin/users`
  (renders the seeded Ada Lovelace mentor via awilix → forked EM → populated 1:1),
  `/api/health` → `{"database":"up"}`. DB-down path renders a graceful card and
  non-500 health.
- ESLint boundary rule confirmed firing on a deliberate cross-package violation.

## Files touched

Root: `package.json`, `tsconfig.json`, `tsconfig.base.json`, `eslint.config.mjs`,
`.gitignore`, `.env.example`, `docker-compose.yml`, `README.md`, `AGENTS.md`.
All of `packages/{app,core,db,ui}`. `.ai/` spec, this run log, and lessons.

## Follow-ups (for a human / future run)

- No test runner yet — pick Vitest vs `node:test` and add tests (esp. for the DI
  scope/EM lifecycle and entity metadata). Tracked in the spec's Follow-ups.
- No auth — placeholder `User`/`MentorProfile` only.
- No CI workflow running typecheck/lint/build/migrations.
- `docker-compose.yml` pins `postgres:17-alpine`; the running dev DB happened to accept
  the default `devmentor` credentials, so migrations were applied live.

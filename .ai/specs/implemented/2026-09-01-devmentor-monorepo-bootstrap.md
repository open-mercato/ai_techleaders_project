# DevMentor — Monorepo Bootstrap

Date: 2026-09-01
Status: active

## Problem / Goal

The repository is currently a bare `create-next-app` seed at the root. We need to turn
it into the foundation of **DevMentor**: an npm-workspaces monorepo on the latest
Next.js + TypeScript + React, with PostgreSQL via MikroORM, awilix for dependency
injection, Tailwind for public/frontend pages and shadcn-ui for the admin/backend
pages.

The deliverable is a *skeleton that runs and typechecks*, not a feature-complete
product. Every architectural decision below must be demonstrated by at least one
working vertical slice so future agents have a pattern to copy rather than invent.

## Non-goals

- Authentication, authorization, sessions, or user management beyond a placeholder
  `User` / `MentorProfile` entity pair.
- Real product features (matching, scheduling, messaging, payments).
- CI/CD pipelines, deployment manifests, or infrastructure beyond a local
  `docker-compose.yml` for Postgres.
- A test suite. (Test tooling choice is deliberately deferred — see Follow-ups.)
- Turborepo / Nx / pnpm. Plain npm workspaces until build times justify more.

## Approach

### Workspace layout

```
packages/
  app     @devmentor/app     Next.js host + composition root
  core    @devmentor/core    config, logger, DI container, domain services
  db      @devmentor/db      MikroORM config, entities, repositories, migrations
  ui      @devmentor/ui      shadcn-ui primitives + Tailwind preset
```

Dependency direction is strictly one-way, no cycles:

```
app ──> core ──> db
 └────> ui
```

- `db` knows nothing about `core` or HTTP.
- `core` knows about `db` but nothing about React or Next.js.
- `ui` is presentational only — no `core`/`db` imports.
- `app` is the only package allowed to import from all of the others.

Packages are consumed as TypeScript source (`exports` → `./src/index.ts`) and
transpiled by Next.js via `transpilePackages`. No per-package build step; one
`tsc --noEmit` at the root typechecks everything through project references.

### Dependency injection

`awilix` container built in `core`:

- A single root container per process, cached on `globalThis` so Next.js HMR does not
  leak containers between reloads.
- `PROXY` injection mode + explicit `asClass`/`asFunction` registrations. No
  `loadModules` auto-globbing — registrations are explicit and greppable.
- Two lifetimes only: `SINGLETON` for the ORM/config/logger, `SCOPED` for anything
  request-bound (forked `EntityManager`, repositories, services).
- Request-scoped work goes through a `withScope(fn)` helper that creates the awilix
  scope, forks the `EntityManager`, runs the callback, and disposes the scope.
- The container's registrations are described by a single `Cradle` interface so
  resolution is type-safe end to end.

### Database

- MikroORM v7 with the PostgreSQL driver, `defineConfig`, and reflect-metadata-free
  decorators (explicit `type:` on every property so no ts-morph step is required).
- Connection pooling configured explicitly on the ORM config, driven by env.
- Migrations live in `packages/db/migrations`, run through the MikroORM CLI wired to
  a workspace-local `mikro-orm.config.ts`.
- A `BaseEntity` supplies `id` (uuid v7), `createdAt`, `updatedAt`.
- Placeholder domain: `User` 1:1 `MentorProfile`, enough to exercise relations,
  repositories, and a migration.

### Frontend / backend split

- **Public pages** (`/`, marketing): Tailwind utility classes only.
- **Admin pages** (`/admin/*`): shadcn-ui components from `@devmentor/ui`.
- Both share one Tailwind v4 CSS entrypoint using CSS-first `@theme` config with the
  shadcn oklch design tokens; `components.json` is committed so
  `npx shadcn@latest add <component>` keeps working and drops components into
  `packages/ui`.

### Configuration

- All env access funnels through one zod-validated schema in `core`. Nothing else in
  the codebase reads `process.env` directly.
- `.env.example` is the documented source of truth; `docker-compose.yml` provides a
  matching local Postgres.

### Resilience

The app must build and boot with **no database reachable** — the DB is touched only
in dynamic (non-prerendered) routes, and those degrade to a visible error state
rather than crashing the render.

## Acceptance criteria

1. `npm install` at the root links all four workspaces.
2. `npm run typecheck` passes with zero errors.
3. `npm run lint` passes with zero errors.
4. `npm run build` produces a successful production build **without a database
   running**.
5. `npm run dev` serves the public page at `/` and the admin dashboard at `/admin`.
6. `GET /api/health` returns JSON reporting app status and DB reachability, with a
   non-500 response when the DB is down.
7. Resolving a service from the awilix container inside a request scope returns a
   forked `EntityManager` — proven by the admin users page reading through a
   repository.
8. `npm run db:migration:create` and `npm run db:migrate` are wired to the MikroORM
   CLI and resolve the config without error.
9. Importing `@devmentor/db` from `@devmentor/ui` (or any other cycle-violating
   import) is caught by lint.
10. `AGENTS.md` documents the stack, layout, dependency rules, and conventions;
    `README.md` documents the architecture.

## Follow-ups (out of scope, for a later spec)

- Test runner selection (Vitest vs node:test) and the first tests.
- Auth strategy.
- CI workflow running typecheck/lint/build/migrations.

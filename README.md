> **Lekcja 04 — przed krokiem 5 (backlog).** Ten branch zawiera przygotowany seed: odświeżony brief, źródła, aktualny panel syntetyczny i zgodne skille. Zacznij od [LESSON-04.md](LESSON-04.md).

# DevMentor

A platform connecting developers with experienced mentors. Built as an
npm-workspaces monorepo on Next.js 16 + React 19 + TypeScript, with PostgreSQL via
MikroORM v7, awilix for dependency injection, Tailwind CSS for public pages, and
shadcn-ui for the admin surface.

> Working in this repo as a human or an AI agent? Read **[AGENTS.md](./AGENTS.md)**
> first — it documents the stack, conventions, and gotchas in depth.

## Getting started

```bash
# 1. Install (links all workspaces)
npm install

# 2. Configure — copy the example and adjust if needed
cp .env.example .env

# 3. Start Postgres (defaults match .env)
npm run db:up

# 4. Create the schema and seed a sample mentor
npm run db:migrate
npm run db:seed

# 5. Run the app
npm run dev
```

Then open:

- <http://localhost:3000> — public landing page (Tailwind).
- <http://localhost:3000/admin> — admin dashboard (shadcn-ui).
- <http://localhost:3000/admin/users> — users list, read through the DI container.
- <http://localhost:3000/api/health> — app + database health JSON.

The app **builds and boots even with no database running**; DB-backed pages degrade
to a visible "unavailable" state instead of crashing.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` across all packages |
| `npm run lint` | ESLint, including dependency-direction rules |
| `npm run test:unit` | Run TypeScript unit tests with Vitest |
| `npm run test:unit:coverage` | Run unit tests with per-file 100% coverage gates |
| `npm run test:browser:install` | Install agent-browser's Chrome runtime locally |
| `npm run test:integration` | Test an ephemeral PostgreSQL + production app with agent-browser |
| `npm run db:up` / `npm run db:down` | Start / stop local Postgres (Docker) |
| `npm run db:migration:create -- --name <x>` | Generate a migration from entity diff |
| `npm run db:migrate` / `npm run db:migrate:down` | Apply / revert migrations |
| `npm run db:seed` | Run the default seeder |

## Testing and pull-request checks

Every pull request runs four independent GitHub checks: **Build**, **Lint**, **Unit
tests**, and **Integration tests**. Configure those exact names as required checks in
the GitHub branch ruleset if merges must be blocked until they pass.

The unit suite uses Vitest and V8 coverage:

```bash
npm run test:unit
npm run test:unit:coverage
```

Coverage is enforced at 100% for statements, branches, functions, and lines on every
file listed in `vitest.config.mts`. New features must add their production files to
that explicit list and add adjacent unit tests in the same change.

The integration suite requires Docker and agent-browser's Chrome runtime. Install the
browser once, then run the suite:

```bash
npm run test:browser:install
npm run test:integration
```

The suite creates a fresh PostgreSQL 17 Testcontainer on a random port, applies
migrations, seeds prerequisites, builds and starts Next.js on another random port,
waits for database readiness, then tests the home page and admin panel through the
pinned `agent-browser` CLI. Screenshots and app logs go to `test-results/integration/`;
the browser, app process, and container are stopped in teardown. POSIX and native
PowerShell launchers are also available at `tests/integration/run.sh` and
`tests/integration/run.ps1`.

## Architecture

### Monorepo packages

The repo is an npm-workspaces monorepo under `packages/*` with a strictly one-way
dependency graph (enforced by ESLint — a cycle fails `npm run lint`):

```
app ──> core ──> db
 └────> ui
```

| Package | Name | Responsibility |
| --- | --- | --- |
| `packages/app` | `@devmentor/app` | Next.js host and **composition root** — the only package allowed to import all others. Contains routes, layouts, and API handlers. |
| `packages/core` | `@devmentor/core` | Config (zod), logging (pino), the **awilix DI container**, and domain services. Depends on `db`; never touches React/Next/UI. |
| `packages/db` | `@devmentor/db` | MikroORM configuration, entities, migrations, seeders. The **leaf** — the only package that imports `@mikro-orm/*`. |
| `packages/ui` | `@devmentor/ui` | shadcn-ui components and Tailwind design tokens. Presentational only. |

Packages are consumed as **TypeScript source** (no per-package build) and transpiled
by Next.js via `transpilePackages`.

### Dependency injection

`@devmentor/core` builds a single awilix container (`PROXY` injection mode, a typed
`Cradle` interface). Lifetimes:

- **Singleton** — `env`, `logger`, `orm` (cached on `globalThis` to survive HMR).
- **Scoped** — a forked `EntityManager` and the domain services that use it.

Request handlers call `withScope(fn)`, which opens a scope with its own forked
`EntityManager`, runs the callback, and disposes the scope. The admin users page is a
worked example: `withScope((c) => c.userService.list())` → forked EM → repository →
entity with a populated 1:1 relation.

### Database

- MikroORM v7 with the PostgreSQL driver, explicit connection pooling, and migrations
  under `packages/db/migrations`.
- Entities are defined with `defineEntity` (MikroORM v7 dropped decorators) and
  registered as `globalThis` singletons so the same schema object is shared across
  Next's RSC/SSR/route module graphs.
- The domain model ships a placeholder `User` 1:1 `MentorProfile` to exercise
  relations, repositories, and migrations end to end.

### Frontend / backend split

- **Public / marketing pages** (`/`) use plain Tailwind CSS v4 utilities.
- **Admin pages** (`/admin/*`) use shadcn-ui components from `@devmentor/ui`. The
  design tokens live in `packages/ui/src/tokens.css`; add components with
  `npx shadcn@latest add <component>` run inside `packages/ui`.

### Spec-driven development

Nontrivial work is specified before it's built. Specs, autonomous-run logs, and
lessons live under `.ai/` — see [AGENTS.md](./AGENTS.md) for the full workflow.

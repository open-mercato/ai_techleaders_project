# One-command idempotent setup installer

Date: 2026-09-03
Status: active
Issue: #37

## Problem / Goal

A new contributor cloning DevMentor has to read `README.md` and execute five manual
steps in the right order (`npm install`, copy `.env.example`, `npm run db:up`,
`npm run db:migrate`, `npm run db:seed`) before `npm run dev` will render anything.
Three failure modes make that path unreliable:

- **It races container startup.** Step 4 migrates as soon as `docker compose up -d`
  returns, which is before PostgreSQL accepts connections on a cold volume, so
  `db:migrate` fails intermittently on a first clone.
- **It presumes Docker.** A contributor who already runs PostgreSQL — natively, in a
  container of their own, or as a managed remote instance named by `DATABASE_URL` —
  has no supported path; the documented commands insist on Compose.
- **It is not repeatable.** `npm run db:seed` inserts the sample mentor
  unconditionally, so a second run dies on the `users.email` unique constraint. That
  makes "just run setup again" bad advice.

Goal: one command, `npm run setup`, that takes a fresh clone to a migrated, seeded
database and is safe to re-run at any time.

## Non-goals

- Starting the dev server. `npm run dev` never exits, so running it from setup would
  hang the installer; setup prints it as the next command instead.
- Replacing any existing script. `db:up`, `db:migrate`, and `db:seed` keep working
  standalone, and the manual sequence stays documented in `README.md` as the
  alternative.
- Installing system-level prerequisites (Node, Docker, PostgreSQL). Setup detects and
  reports them; it never installs them.
- Provisioning databases, roles, or credentials on a PostgreSQL it did not start.
- Cross-shell installers (`.sh`/`.ps1`). One Node entry point covers every platform
  the repository already supports.
- Any schema change. This work ships no migration.

## Approach

### Structure

`scripts/setup/`, plain Node ESM importing only `node:*` built-ins — the installer has
to run on a fresh clone *before* `npm install` exists, so it cannot depend on `tsx`,
zod, or any package. Three files, split so that every decision is testable without
Docker, npm, or a filesystem:

- `steps.mjs` — pure decisions, no side effects: version parsing, `.env` parsing,
  database-target resolution, install-freshness comparison, Compose health parsing,
  output formatting.
- `effects.mjs` — the only contact with the outside world, behind a `SetupEffects`
  object: `run`, `readText`, `writeText`, `mtime`, `probeTcp`, `log`, `sleep`, plus
  `nodeVersion`, `platform`, and `env`. Each function is a thin adapter over a
  `node:*` built-in with no decision logic.
- `run.mjs` — ordering. Takes `SetupEffects` as its only argument, so the whole
  installer runs against fakes in unit tests.
- `index.mjs` — composition only: `process.exitCode = await runSetup(createNodeEffects())`.

### Step sequence

1. **Preflight** — Node major against `engines.node`. Docker is deliberately *not*
   checked here; whether it is needed at all is decided in step 4.
2. **Install dependencies** — skipped when `node_modules/.package-lock.json` is at
   least as new as `package-lock.json`, which is npm's own end-of-install marker.
3. **Configure `.env`** — copy from `.env.example` when absent. An existing `.env`
   holds real local configuration and is **never** overwritten; setup instead reports
   any documented variable it does not set.
4. **Provision PostgreSQL** — TCP-probe the configured address and reuse whatever
   answers. Docker Compose is consulted only when nothing does, and only then is its
   absence an error. When Compose does start the container, poll
   `docker compose ps --format json` until the `pg_isready` healthcheck passes, which
   is the race the manual steps lose.
5. **Apply migrations** — `npm run db:migrate`; MikroORM skips already-applied ones.
6. **Seed sample data** — `npm run db:seed`, made idempotent by this work.

Each step yields `ran` / `skipped` / `warned` / `failed` with a detail string
explaining *why*. The run stops at the first `failed` and exits 1.

### Environment precedence

`resolveDatabaseTarget` mirrors the two zod schemas: `DATABASE_URL` wins over the
discrete `DB_*` variables, and the real environment wins over `.env`. Because the
installer cannot import zod, this is a third implementation of that precedence and is
recorded as such in `AGENTS.md` and `CODE_REVIEW.md`, which otherwise forbid reading
`process.env` outside the two schemas.

`.env.example` documents `DATABASE_URL` only as a comment, so completeness checking
treats it as satisfying the five discrete connection variables it replaces
(`DATABASE_URL_SUPERSEDES`). Pool sizing and `DB_DEBUG` stay individually required — a
connection URL says nothing about them.

### Idempotent seeding

`DatabaseSeeder.run` looks up the sample mentor by its unique email and returns early
when present. The `users.email` unique constraint remains the backstop.

Colocating `database.seeder.test.ts` next to the seeder (as the repository's testing
rules require) breaks the MikroORM CLI, whose default seeder glob imports every `.ts`
file in `seeder.path` to build its class map. `packages/db/src/config.ts` therefore
sets `seeder.glob: '!(*.d|*.test).{js,ts}'`.

## Acceptance criteria

1. `npm run setup` on a fresh clone with Docker available reaches a migrated, seeded
   database and exits 0.
2. Running `npm run setup` a second time exits 0, reports the already-done steps as
   `skipped`, and leaves exactly one sample mentor in the database.
3. An existing `.env` is never overwritten; a missing documented variable produces a
   `warned` step, not a failure, and a `.env` that configures `DATABASE_URL` instead
   of the discrete variables is not reported as incomplete.
4. With a PostgreSQL already listening and **no Docker installed**, setup reuses the
   running instance, never invokes Docker, and exits 0.
5. With no database listening and no Docker, setup fails with a message naming both
   remedies — start Docker, or point `DATABASE_URL` at an existing PostgreSQL — and
   never a raw stack trace.
6. Setup does not start the dev server; it prints `npm run dev` as the next command.
7. `npm run db:seed` is safe to run repeatedly.
8. Unit tests cover 100% of statements, branches, functions, and lines for every new
   or changed production file, each listed in `coverage.include`.
9. Integration coverage seeds twice against the ephemeral database and asserts a
   single sample mentor survives, through both the API and the admin page.
10. `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` pass.
11. `README.md` and `AGENTS.md` document the quick path, the bring-your-own-PostgreSQL
    behavior, and the idempotency guarantee.

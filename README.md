# DevMentor

A platform connecting developers with experienced mentors. Built as an
npm-workspaces monorepo on Next.js 16 + React 19 + TypeScript, with PostgreSQL via
MikroORM v7, awilix for dependency injection, Tailwind CSS for public pages, and
shadcn-ui for the admin surface.

> Working in this repo as a human or an AI agent? Read **[AGENTS.md](./AGENTS.md)**
> first — it documents the stack, conventions, and gotchas in depth.

## Getting started

Requires **Node ≥ 24**. Docker is optional — see
[Bring your own PostgreSQL](#bring-your-own-postgresql).

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` does everything the manual steps below do: installs workspace
dependencies, creates `.env` from `.env.example`, makes sure a PostgreSQL is running,
applies migrations, and seeds a sample mentor.

It is **idempotent** — run it as often as you like. Every step checks whether it is
already done and reports itself as `ran` or `skipped`, so a second run only does the
work that is actually outstanding:

```text
✔ Preflight (ran) — Node v24.10.0
↷ Install dependencies (skipped) — node_modules is up to date with package-lock.json
↷ Configure .env (skipped) — .env already exists and sets every documented variable
✔ Start PostgreSQL (ran) — docker compose up -d postgres
✔ Wait for PostgreSQL (ran) — container reports healthy
✔ Apply migrations (ran) — npm run db:migrate
✔ Seed sample data (ran) — npm run db:seed
```

Your existing `.env` is never overwritten. If it is missing a variable that
`.env.example` documents, setup leaves the file alone and warns you which key to add.
Setting `DATABASE_URL` counts as setting the discrete `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, and `DB_PASSWORD` variables it replaces, so the URL style is never reported
as incomplete.
Setup deliberately stops short of starting the app — `npm run dev` never exits — and
prints it as the next command instead.

### Bring your own PostgreSQL

**Docker is only a fallback.** Setup first checks whether anything is already
listening at the address the app is configured to use, and reuses it if so — a
container you started yourself, a native PostgreSQL install, or a managed remote
database. Docker Compose is consulted only when nothing answers, and only then does
its absence become an error.

To point setup at an existing database, set `DATABASE_URL` (or the discrete `DB_*`
variables) in your environment or in `.env`:

```bash
DATABASE_URL=postgres://user:password@db.example.com:5432/devmentor npm run setup
```

```text
↷ Provision PostgreSQL (skipped) — something is accepting connections on
  db.example.com:5432 (per DATABASE_URL from the environment) — reusing it as the
  DevMentor database; Docker not needed
```

The check is a TCP probe, so it can tell that *something* is listening but not that it
speaks PostgreSQL. If the listener turns out not to be your DevMentor database, the
`Apply migrations` step below it reports the real connection error.

Resolution order matches the Zod config modules: `DATABASE_URL` wins over
`DB_HOST`/`DB_PORT`, and the real environment wins over `.env`. With no database
reachable *and* no Docker, setup stops and names both remedies rather than failing
with a stack trace.

### Manual setup (alternative)

The individual steps, if you would rather run them yourself or need to deviate:

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

Note that step 4 races the container's startup on a cold `db:up`; wait for
`docker compose ps` to report `healthy` before migrating. `npm run setup` handles that
wait for you.

Then open:

- <http://localhost:3000> — public landing page (Tailwind).
- <http://localhost:3000/admin> — admin dashboard (shadcn-ui).
- <http://localhost:3000/admin/users> — users list, read through the DI container.
- <http://localhost:3000/api/health> — app + database health JSON.

The app **builds and boots even with no database running**; DB-backed pages degrade
to a visible "unavailable" state instead of crashing.

## Configuration

Every variable is declared in `.env.example` and validated by a zod schema —
`packages/core/src/config/env.ts` for the app, `packages/db/src/env.ts` for the
MikroORM CLI. Nothing under `packages/` reads `process.env` directly.

### Application

| Variable | Default | What it does |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production`. |
| `APP_NAME` | `DevMentor` | Name attached to every log line. |
| `LOG_LEVEL` | `info` | pino level, from `fatal` to `silent`. |
| `APP_URL` | `http://localhost:3000` | Absolute origin of this deployment. Builds the OAuth redirect URI and the links in outbound mail, so it must be the address a browser actually reaches. Must be `http://` or `https://`. |
| `TRUSTED_PROXY_HOPS` | `0` | How many reverse proxies sit in front of the app. The rate limiter takes the client IP this many hops from the right of `x-forwarded-for`; `0` trusts no forwarded header, so per-IP limiting is off and only the per-email limits apply (a warning says so once per process). Counting from the right is deliberate: a proxy appends to the header, so a value a client forged always sits to the left of the one infrastructure wrote. |
| `INVITATION_TTL_DAYS` | `14` | Days a newly created mentor invitation remains valid. Snapshotted when the invitation is created. |
| `MENTOR_PUBLISH_WINDOW_DAYS` | `14` | Days an accepted mentor has to publish a bookable session. Snapshotted at acceptance. |
| `PLATFORM_CURRENCY` | `PLN` | Fixed platform currency for mentor prices. The first release rejects every other currency. |
| `PLATFORM_PRICE_BOUNDS` | `{"25":{"minCents":9000,"maxCents":60000},"50":{"minCents":18000,"maxCents":120000}}` | Integer-cent inclusive bounds for 25- and 50-minute sessions. Must be valid JSON in the exact documented shape and no longer than 256 characters. |

### Database

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | *(unset)* | Full connection URL. Takes precedence over every `DB_*` variable it replaces. |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5432` | Discrete connection, used when `DATABASE_URL` is unset. |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `devmentor` | Discrete connection, as above. Defaults match `docker-compose.yml`. |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `2` / `10` | Connection pool bounds. Not implied by `DATABASE_URL`. |
| `DB_POOL_IDLE_MS` | `30000` | How long an idle pooled connection is kept. |
| `DB_DEBUG` | `false` | `true` logs every SQL statement. |

### Authentication

| Variable | Default | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | *(unset)* | Signs every session cookie and every short-lived purpose token. At least 32 characters — a shorter value is rejected at boot. Generate one with `openssl rand -base64 32`. |
| `SESSION_SECRET_PREVIOUS` | *(unset)* | The outgoing secret during a rotation. Accepted on verify, never used to sign, so live sessions survive their remaining lifetime. Same 32-character minimum. |
| `GITHUB_CLIENT_ID` | *(unset)* | GitHub OAuth app client ID — see below. |
| `GITHUB_CLIENT_SECRET` | *(unset)* | GitHub OAuth app client secret. |
| `PASSWORD_HASH_CONCURRENCY` | `2` | How many `scrypt` hashes may run at once in this process. The bound is memory, not CPU: at the parameters this project fixes (N=2¹⁷, r=8, p=1) one hash holds 128 MiB for its whole duration, so `2` caps the hashing path at ~256 MiB. It cannot be unbounded, because the rate limiter in front of it is keyed per IP *and* per email rather than globally. Raising it past `UV_THREADPOOL_SIZE` (4 by default) buys queueing inside libuv rather than more parallelism. |
| `PASSWORD_HASH_WAIT_MS` | `2000` | How long a request waits for a free hashing slot before the gate answers `503 service_unavailable`. That 503 is deliberately raised *before* the rate limiter is consumed, so a burst cannot lock out users who were merely unlucky. `0` means never queue. |
| `OPERATOR_EMAILS` | *(empty)* | Comma-separated founder addresses. Operator authority is derived from this list on **every** request and matched, trimmed and case-insensitively, against the account's verified email — so removing an address takes effect on that person's very next request rather than at their next sign-in. |

### Signing in

Two methods, one session. **GitHub is the primary one** and is the first action on
`/sign-in` and `/register`; the email form below it posts to `POST /api/auth/login` and
`POST /api/auth/register`.

Registration writes the account immediately but issues **no** session: `email_verified_at`
is what allows a sign-in, and only the link mailed by `GET /api/auth/verify-email` sets it.
Opening that link confirms the address and signs the browser in on the same redirect.
There is no resend route — registering the same address again re-claims the unconfirmed row
and sends a fresh link.

Locally, with `MAILER_ADAPTER` unset in development, the log mailer is selected
automatically and the link is written to the app's own output as a `mail.sent` line
carrying `to`, `subject` and `text`. So: register in the browser, find that line in the
`npm run dev` output, and open the URL in it.

The seeded personas (`mock-mentee@`, `mock-mentor@` and `mock-operator@devmentor.test`)
carry a password as well as a GitHub identity. It is `SEED_PASSWORD` in
`packages/db/src/seeders/seed-password.ts` — published, obviously fake, and useless
anywhere real.

Sign-in and registration are rate-limited per IP and per email address (10 and 5 per 15
minutes for sign-in, 5 per hour for registration). Tripping a limit answers `429` with
`Retry-After`; the counters live in `auth_rate_limits`, so they survive a restart. Behind a
proxy, set `TRUSTED_PROXY_HOPS` so the client IP is read from the right position in
`x-forwarded-for` — with it unset, the per-IP bucket is skipped and only the per-email one
applies.

### Mail

`MAILER_ADAPTER=resend` plus `MAIL_API_KEY` and `MAIL_FROM` deliver for real. Development
falls back to the log mailer described above; a production deployment without a key fails
at container creation rather than serving a registration form that always 503s.

| Variable | Default | What it does |
| --- | --- | --- |
| `MAILER_ADAPTER` | *(unset)* | `resend` for real delivery. Left unset in development the log mailer will be selected on its own; `log` set explicitly is refused outside an integration run (below). |
| `MAIL_API_KEY` | *(unset)* | Resend API key. |
| `MAIL_FROM` | *(unset)* | Envelope sender, e.g. `DevMentor <hello@devmentor.example.com>`. |

### Integration-test doubles

Set by `tests/integration/environment.ts`, never on a real deployment.

| Variable | Default | What it does |
| --- | --- | --- |
| `AUTH_IDENTITY_ADAPTER` | *(unset)* | `github` for real sign-in, `mock` for the harness double. |
| `INTEGRATION_TEST_RUN` | *(unset)* | The literal `1` marks the process as an integration-test run, which is what permits a `mock` or `log` adapter. |

### Missing, dangerous, and required-in-production

The three categories behave differently on purpose:

- **Missing integration credentials fail closed at the route.** With no
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `/api/auth/github` redirects the browser to
  `/sign-in?error=unavailable`, where the page says sign-in is temporarily unavailable.
  Everything else — the marketing pages, the build, the boot — carries on. One
  unconfigured integration never takes the site down.
- **Dangerous configuration fails at boot, loudly.** `AUTH_IDENTITY_ADAPTER=mock`
  replaces GitHub sign-in with a fake identity, and `MAILER_ADAPTER=log` writes email
  to the application log instead of delivering it. Either one without
  `INTEGRATION_TEST_RUN=1` — and only the literal `1` counts — makes the process refuse
  to start. The alternative, silently falling back to the real adapter, would leave an
  operator believing the mock is active when it is not.
- **Production requires `SESSION_SECRET` at boot.** A production deployment without the
  secret that signs every session cookie must not come up green and then fail every
  sign-in. The check runs at first container creation, **not** in the zod schema,
  because `npm run build` forces `NODE_ENV=production` and CI builds with no
  environment at all; the container is only ever created while serving a request.
  Development is unaffected — `npm run dev` starts without a secret, and sign-in fails
  closed until you set one.

The integration harness supplies its own database URL, session secret and test-double
signals (`tests/integration/environment.ts`); you do not need any of them in a local
`.env`.

### Creating a GitHub OAuth app

1. Go to **Settings → Developer settings → OAuth Apps → New OAuth App**
   (<https://github.com/settings/developers>).
2. **Application name** — anything; it is shown on the consent screen.
   **Homepage URL** — your `APP_URL`.
   **Authorization callback URL** — `<APP_URL>/api/auth/github/callback`, so
   `http://localhost:3000/api/auth/github/callback` for local development. GitHub
   matches this exactly, and a mismatch is the usual cause of a failed sign-in.
3. Register the app, copy the **Client ID**, then **Generate a new client secret** and
   copy that too — GitHub shows it once.
4. Put both in `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, and set
   `SESSION_SECRET` alongside them. Use a separate OAuth app per environment; the
   callback URL is per-app, so local and production cannot share one.

## Scripts

| Command | Description |
| --- | --- |
| `npm run setup` | One-command install, configure, database up, migrate, and seed (idempotent; reuses an existing PostgreSQL, Docker only as fallback) |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` across all packages |
| `npm run lint` | ESLint, including dependency-direction rules |
| `npm run test:unit` | Run TypeScript unit tests with Vitest |
| `npm run test:unit:coverage` | Run unit tests with per-file 100% coverage gates |
| `npm run test:browser:install` | Install agent-browser's Chrome runtime locally |
| `npm run test:integration` | Test an ephemeral PostgreSQL + production app with agent-browser |
| `npm run invite -- create <email> --operator <label> --tags TypeScript,React [--batch <label>]` | Create a single-use mentor invitation. The audit line is token-free; the link is printed separately once. |
| `npm run invite -- revoke <id> --operator <label>` | Revoke a pending mentor invitation. |
| `npm run invite -- resend <id> --operator <label>` | Rotate a pending invitation token and expiry, then print the new link separately. |
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

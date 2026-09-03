# Pull-request CI and testing foundations

Date: 2026-09-02
Status: active

## Problem / Goal

DevMentor has no pull-request validation or automated test framework. Every pull
request must independently prove that the application builds, the repository lints,
unit tests pass, and a production instance can run against an ephemeral PostgreSQL
database and be exercised through `agent-browser`.

The repository also needs a durable contributor rule: every new feature must ship
with unit tests that cover 100% of the feature's new or changed behavior.

## Non-goals

- Deploying the application or publishing CI artifacts outside GitHub Actions.
- Replacing the local `docker-compose.yml` development database.
- Retrofitting unit tests for every pre-existing source file other than the explicitly
  requested PR #3 target, `packages/core/src/http/makeCrudRoute.ts`.
- Adding product flows beyond the existing health and admin-users vertical slice.
- Running integration tests against shared, seeded, or long-lived infrastructure.

## Approach

### Pull-request workflow

Add one least-privilege GitHub Actions workflow triggered by `pull_request`, with
cancel-in-progress concurrency and four separately visible jobs:

1. **Build** installs the lockfile and runs the production build.
2. **Lint** installs the lockfile and runs ESLint.
3. **Unit tests** runs Vitest with V8 coverage and uploads the coverage report.
4. **Integration tests** installs the pinned `agent-browser` browser runtime, starts
   the Testcontainers-backed harness, and uploads screenshots/log artifacts even when
   the scenario fails.

Each job uses `npm ci` and an npm cache. Jobs are intentionally independent so a
failure reports the responsible gate directly and integration tests never depend on
state leaked from another job.

### Unit test framework

Use Vitest with TypeScript-native ESM support and V8 coverage. Keep unit tests next to
the source they exercise (`*.test.ts` / `*.test.tsx`) and exclude integration tests
from the unit suite. Configure per-file 100% statement, branch, function, and line
thresholds. The initial coverage scope is the explicitly requested PR #3 file,
`packages/core/src/http/makeCrudRoute.ts`; its suite must exercise every method,
authorization branch, schema-success/schema-failure path, missing-id path, and
collection-route-without-params path.

`AGENTS.md` will make the forward-looking rule unambiguous: a feature is incomplete
unless unit tests exercise every new or changed branch at 100% coverage; integration
tests supplement but do not replace those unit tests. The PR author must expand tests
in the same change and run the coverage command before completion.

### Ephemeral integration environment

Use the PostgreSQL Testcontainers module from a TypeScript/Vitest integration global
setup. For each suite run it will:

1. start a fresh pinned PostgreSQL 17 container on a random host port;
2. pass the container connection URI only to child processes;
3. apply MikroORM migrations and run the default seeder;
4. build and start the production Next.js app on an available local port;
5. wait until `/api/health` reports both the app and database ready;
6. provide the discovered base URL to integration tests;
7. terminate the app and stop the container in teardown, including failure paths.

The executable browser scenarios will use isolated `agent-browser` sessions and
semantic page output to verify the public home page and the admin basics: dashboard
database status plus the seeded admin-users list. They will capture screenshots as CI
evidence and always close their browser sessions. The base URL, database port, and
application port must never be hardcoded.

### Runtime compatibility

Use Node >=24 consistently in the repository and CI. Current Testcontainers and
`agent-browser` releases converge on Node 24; using their old Node-20-compatible
lines introduces known vulnerable transitive dependencies. Pin exact test-tool
versions in the lockfile so the integration environment remains reproducible.

## Task breakdown and verification

- [x] Add Vitest unit configuration, scripts, and exhaustive `makeCrudRoute` tests —
  verify that the target file reports 100% in every metric with
  `npm run test:unit:coverage`.
- [x] Add the Testcontainers application lifecycle and an `agent-browser` scenario —
  verify with `npm run test:integration` against a local Docker daemon.
- [x] Add the pull-request GitHub Actions workflow — validate syntax and mirror every
  job command locally where the environment permits.
- [x] Update `AGENTS.md` and `README.md` with commands, CI behavior, and the mandatory
  100%-covered-new-feature rule — verify by reviewing the rendered Markdown and lint.
- [x] Run the full gate (`typecheck`, `lint`, unit coverage, build, integration),
  inspect the diff against these acceptance criteria, and record exact results in the
  run log.

## Acceptance criteria

1. Pull requests trigger separately named build, lint, unit-test, and integration-test
   jobs.
2. `npm run build` succeeds without requiring a database.
3. `npm run lint` succeeds and still enforces package dependency direction.
4. `npm run test:unit` executes TypeScript unit tests through Vitest.
5. `npm run test:unit:coverage` explicitly includes
   `packages/core/src/http/makeCrudRoute.ts`, enforces 100% statements, branches,
   functions, and lines for that file, and emits CI-readable coverage artifacts.
6. `AGENTS.md` explicitly requires each new feature to have unit tests covering 100%
   of its new or changed behavior and states that integration tests are not a
   substitute.
7. `npm run test:integration` creates a fresh PostgreSQL Testcontainer, migrates and
   seeds it, boots a production Next.js server on a discovered port, and waits for a
   database-ready health response.
8. The integration scenarios use `agent-browser` to observe and assert the live home
   page, `/admin` dashboard (including connected database status), and `/admin/users`
   surface (including the seeded mentor), and record screenshots.
9. App processes, browser sessions, and containers are cleaned up on both successful
   and failed runs.
10. No committed test uses a fixed database port, application port, container name,
    shared database, or pre-existing external data.
11. Documentation tells contributors how to install the browser runtime and run both
    suites locally.

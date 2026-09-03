# Backward compatibility — protected contract surfaces

What this project treats as a contract, what counts as breaking each one, and the required path for changing it. Review skills check diffs against this file; implementation skills warn when a change violates it. The surfaces below are an inventory of what this repository actually exposes today — when a new surface appears (a public CLI, a webhook, an external API consumer), add it here in the same PR.

## Current compatibility posture

DevMentor is at `0.1.0`, every workspace package is `private: true`, and nothing is published to a registry. There is no external consumer to break yet, so the protection here is **internal**: the surfaces below are what the rest of the monorepo, the database, and the running app depend on, and breaking one silently is how a green build ships a broken app. The rules are deliberately proportionate — a documented, reviewed break is fine at this stage; an undocumented one is not.

The one surface that is externally irreversible regardless of version number is **the database**: a migration that has run against real data cannot be undone by editing code.

## 1. Package exports (`@devmentor/core`, `@devmentor/db`, `@devmentor/ui`)

The contract is each package's `exports` map plus the symbols re-exported from those entry points:

| Package | Entry points |
|---|---|
| `@devmentor/core` | `.`, `./container`, `./services`, `./http`, `./events`, `./validators/*` |
| `@devmentor/db` | `.`, `./entities`, `./config` |
| `@devmentor/ui` | `.`, `./backend`, `./tokens.css`, `./lib/utils`, `./components/*` |

**Breaking:** removing or renaming an entry point or an exported symbol; narrowing a function's accepted parameter types or widening its return type; making an optional parameter or object field required; changing a `ui` component's prop names or required props.

**Required path:** update every call site in the same PR (the monorepo has no external consumers, so "every call site" is knowable — `npm run typecheck` must prove it), state the break in the PR description, and keep the old name as a deprecated re-export for one PR when the change is wide enough that in-flight branches would silently conflict. Removing an entry point from an `exports` map always needs an explicit note; it is invisible to `tsc` from outside the package.

Because packages ship TypeScript source rather than built JS, the type signature *is* the published artifact — a type-only change is a real break, not a refactor.

## 2. HTTP API (`/api/*`) and the response envelope

Routes today: `GET /api/health`, and `GET`/`POST /api/users`.

The **envelope** is the strongest contract in the repo: `{ ok: true, data }` on success and `{ ok: false, error: { code, message, fieldErrors? } }` on failure, with the status set from the thrown `AppError`. It is declared twice on purpose — `packages/core/src/http/apiHandler.ts` (server) and `packages/ui/src/backend/api/types.ts` (client) — because `ui` must not import `core`.

**Breaking:** changing the envelope shape on either side without the other; renaming or repurposing an error `code` (`bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `internal_error`) — clients branch on the code, not the message; changing the status an existing `AppError` subclass maps to; removing a route or an HTTP verb; removing or renaming a response field; making a previously optional request field required, or tightening validation on an existing field; adding authorization to a route that was reachable without it.

**Not breaking:** adding a new route, adding an optional request field, adding a response field, or changing a human-readable `message`.

**Required path:** change both envelope declarations in the same PR; for a status, code, or field change, name it explicitly in the PR description and update every consumer (`apiCall` call sites, `CrudForm`/`DataTable` usage, and the integration tests under `tests/integration/`). `/api/health`'s body (`status`, `app`, `environment`, `database`) is consumed by the integration harness's readiness probe — a field rename there breaks the test bootstrap before it breaks anything else, so update `tests/integration/global-setup.ts` alongside it. Its deliberate behavior of returning 200 while reporting `database: "down"` is part of the contract: flipping it to 503 changes readiness semantics for anything that probes it, and needs a stated decision.

## 3. Database schema and migrations

Entities live in `packages/db/src/entities/<concept>/`; migrations are generated with `npm run db:migration:create -- --name <x>` and applied with `npm run db:migrate`.

**Breaking:** dropping or renaming a table or column; narrowing a column type or length; adding a `NOT NULL` column with no default to a populated table; adding a unique constraint that existing rows can violate; changing a primary key or a foreign-key relation; removing an enum value in use.

**Required path:**

- Every entity change ships with its generated migration in the same PR. An entity diff without a migration is a blocker.
- A migration that has been applied anywhere beyond a local database is **never edited** — it is superseded by a new one.
- Destructive changes go in two steps across two PRs: first add the new shape and backfill/dual-write, then drop the old one once nothing reads it. A single PR that adds a column and deletes its predecessor cannot be rolled back cleanly.
- Every migration must have a working `down`, and the PR should say whether `npm run db:migrate:down` was actually exercised.
- Renames are expressed as rename operations, not drop-and-create — the generated diff will happily propose the destructive version.

## 4. Configuration and environment

The env schemas are `packages/core/src/config/env.ts` (app) and `packages/db/src/env.ts` (MikroORM CLI); `.env.example` is the documented surface, and `docker-compose.yml` supplies the local defaults.

**Breaking:** adding a required variable with no default (every existing `.env`, CI job, and deployment breaks at boot); renaming a variable; removing a default; narrowing an accepted value set — for example dropping a member of the `NODE_ENV` or `LOG_LEVEL` enums.

**Required path:** prefer a sensible default over a required variable. When a variable genuinely must be required, add it to `.env.example` with a comment in the same PR, update `docker-compose.yml` and the CI workflow if they need it, and say so in the PR description. The two env schemas overlap on the database variables by design — change them together or they drift. Never put a real secret in `.env.example`, a spec, a PR comment, or a log line.

## 5. Domain events

`packages/core/src/events/event-map.ts` is the single source of truth for event IDs, keyed `concept.entity.action` in the past tense (today: `auth.user.created`). The bus is in-process and synchronous — there is no queue and no worker.

**Breaking:** renaming or removing an event ID; removing or renaming a payload field; changing a payload field's type; narrowing who emits an event that others already subscribe to.

**Not breaking:** adding a new event, or adding an optional payload field.

**Required path:** update `EventMap` and every subscriber in the same PR — the typed bus makes `npm run typecheck` the enforcement mechanism, so a break that typechecks means a subscriber was missed elsewhere. Because delivery is synchronous and in-process, a subscriber that throws propagates into the emitting request; treat "this handler can now throw" as a behavioral break of the emitter's contract.

## 6. Package scripts and the toolchain

The root `package.json` scripts are the interface used by humans, `.github/workflows/ci.yml`, the pipeline's validation gate in `.ai/agentic.config.json`, and `SDLC.md`.

**Breaking:** renaming or removing a script that any of those reference — notably `typecheck`, `lint`, `build`, `test:unit`, `test:unit:coverage`, `test:integration`, `test:browser:install:ci`, and the `db:*` family; raising the required Node version above the `>=24.0.0` engine; changing what a script does without changing its name (for example making `test` skip coverage).

**Required path:** update the CI workflow, `.ai/agentic.config.json`, and `SDLC.md` in the same PR, and keep the old script name as an alias for one release when other automation may still call it. The coverage thresholds in `vitest.config.mts` (100% per file) are part of this contract: lowering a threshold or shrinking `coverage.include` is a policy change requiring maintainer sign-off, never a way to get a PR green.

## 7. Internal architectural invariants

Not "public API", but load-bearing enough that breaking one produces failures far from the change:

- **Dependency direction** (`app → core → db`, `app → ui`), enforced by `no-restricted-imports` in `eslint.config.mjs`. Relaxing a boundary rule needs maintainer sign-off.
- **The entity singleton registry** (`db/src/entities/define.ts`) — bypassing it breaks `populate` only at runtime, only in some module graphs.
- **The app builds and boots with no database reachable.** Any change that makes a static path touch the database breaks CI's Build job and every cold start.
- **Packages ship TypeScript source**, compiled by Next's `transpilePackages`; introducing a per-package build step changes how every consumer resolves the package.

## When a break is genuinely warranted

Do it deliberately: state in the PR description what breaks, who is affected, and what a consumer must do; land the migration path (deprecation, backfill, or alias) in the same PR when one is possible; label the PR `risk-high` and `needs-qa`; and record the reasoning in a spec under `.ai/specs/` when the break follows from a design decision rather than a bug. A break that is documented, reviewed, and tested is acceptable at this stage of the project — an undocumented one is not, regardless of how green the build is.

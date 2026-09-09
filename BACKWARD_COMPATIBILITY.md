# Backward compatibility

What this repository treats as a protected contract surface, what counts as a breaking
change to each, and the path such a change must take. Review skills check every PR
against this file; implementation skills warn when a change is not compliant. Humans
use it the same way.

The consumers of these surfaces are inside the repository today: the four workspace
packages consume each other as TypeScript source, the integration harness under
`tests/integration/` drives the running app, CI and the branch ruleset key on script
and job names, and the local tooling (`docker-compose.yml`, `openmercato.toml`,
`scripts/preview.sh`) keys on npm scripts. The packages are private (`0.1.0`,
unpublished), so there is no external semver to bump. "Breaking" therefore means: a
consumer listed below stops working, or an operator following `README.md` gets a
different result.

## General rule

Additive changes are free: a new optional field, a new export, a new route, a new
event, a new environment variable with a default. Everything else on a surface below is
a breaking change and follows the path in "How to make a breaking change" at the end.

## Surfaces

### 1. HTTP API (`packages/app/src/app/api/`)

**The envelope.** Every `/api/*` route built with `apiHandler` or `makeCrudRoute`
answers `{ ok: true, data }` or `{ ok: false, error: { code, message, fieldErrors? } }`.
The shape is declared twice on purpose, in `packages/core/src/http/apiHandler.ts` and
`packages/ui/src/backend/api/types.ts`, because `ui` must not import `core`.

**Status and error codes**, from `packages/core/src/http/errors.ts` and `apiHandler.ts`:
400 `bad_request`, 401 `unauthorized`, 403 `forbidden`, 404 `not_found`,
409 `conflict`, 422 `validation_failed` (with `fieldErrors`, keyed by dotted path or
`_root`), 500 `internal_error`, 503 `service_unavailable` (an integration credential is
unset, an upstream call failed or timed out, or a bounded internal resource is
saturated — always retryable, and it never carries the upstream status or body). The
client adds `network_error` and `invalid_response` in `apiCall.ts`.

An `AppError` may also carry an optional `headers` bag that `apiHandler` copies onto the
failure response; `content-type: application/json` is written last and always wins.

**Routes in place:**

- `GET /api/health`: a plain JSON probe, not enveloped:
  `{ status: "ok", app, environment, database: "up" | "down", databaseError? }`, HTTP
  200 even when the database is down. `tests/integration/global-setup.ts` polls it and
  waits for `status === "ok"` and `database === "up"`; `README.md` documents it.
- `GET /api/users` returns `UserDto[]`; `POST /api/users` takes
  `{ email, displayName }` (`userCreateSchema`) and returns `UserDto`, where
  `UserDto = { id, email, displayName, createdAt (ISO string), mentorProfile: { id, headline } | null }`.
  The route is intentionally public until the `auth` concept lands.
- `makeCrudRoute` behavior asserted by `packages/core/src/http/makeCrudRoute.test.ts`:
  the default id parameter `id`, and the messages "This operation is not supported",
  "Missing resource id", and "Request body must be valid JSON".

**Breaking:** removing or renaming a response field; changing a status code, an error
code, or the envelope shape; making a currently public route require a session without
shipping the client side of it; changing `/api/health` to return non-200 on database
loss (the file itself calls this out as an option; it also breaks the readiness poll).

**Required path:** change both envelope declarations together; update the unit tests
and the integration scenarios that assert on the route; update `README.md` where the
route is documented; list the change under "Breaking changes" in the PR body. A new
error code is additive as long as existing codes keep their meaning.

### 2. Workspace package exports

The `exports` maps in each `package.json` and the named exports behind them are the
API between packages. `npm run typecheck` is the consumer check.

- `@devmentor/core` (`.`, `./container`, `./services`, `./http`, `./events`,
  `./validators/*`): `getEnv`, `createLogger`, `getContainer`, `withScope`, the
  `Cradle` keys (`env`, `logger`, `orm`, `eventBus`, `em`, `userService`),
  `UserService` and `UserDto`, the `AppError` family and `isAppError`, `apiHandler`,
  `jsonOk`, `jsonError`, `makeCrudRoute` with `CrudService` and
  `MakeCrudRouteOptions`, `safeReturnTo`, `fetchJson` with `FetchJsonOptions`,
  `OutboundHttpError` and `DEFAULT_TIMEOUT_MS`, `readSession`, `requireSession`, `requireRole`,
  `assertOwnership`, `Session`, `Role` (`'student' | 'mentor'`), `EventBus`,
  `EventMap`, `userCreateSchema`, and the re-exported `checkDbConnection`.
- `@devmentor/db` (`.`, `./entities`, `./config`): `User`, `MentorProfile`, `IUser`,
  `IMentorProfile`, `baseProperties`, `entities`, `createOrmConfig`, `getOrm`,
  `closeOrm`, `checkDbConnection`, `getDbEnv`, `MikroORM`, `EntityManager`, and the
  re-exported `EntityRepository`, `FilterQuery`, `Loaded`, `RequiredEntityData`.
- `@devmentor/ui` (`.`, `./backend`, `./tokens.css`, `./lib/utils`, `./components/*`):
  `cn`, `Button` and `buttonVariants`, the `Card*` family; from `./backend`:
  `apiCall`, `apiCallOrThrow`, `ApiError`, `ApiCallOptions`, `ApiResult`,
  `FieldErrors`, `CrudForm` with `CrudField`, `CrudFieldType`, `CrudFormProps`,
  `DataTable` with `Column`, `DataTableProps`, `DataTablePagination`,
  `LoadingMessage`, `ErrorMessage`, `EmptyState`; from `./tokens.css`: the CSS
  variable names (`--background`, `--foreground`, `--primary`, `--destructive`,
  `--border`, `--ring`, ...) that Tailwind utilities map onto.

**Breaking:** removing an export or a subpath; changing a function signature, a
component prop, or a `Cradle` key; changing the dependency direction
(`app -> core -> db`, `ui` standalone) enforced by `eslint.config.mjs`.

**Required path:** update every in-repo consumer in the same PR so `npm run typecheck`
and `npm run lint` stay green; keep the old name as a re-export for one PR only when
the change spans several concepts; note it in the PR body.

### 3. Database schema, migrations, and seed data (`packages/db/`)

- Tables: `users` (`id` uuid, `created_at`, `updated_at`, `email` unique,
  `display_name`) and `mentor_profiles` (`id`, timestamps, `user_id` unique with a
  cascading foreign key to `users`, `headline`, `bio` nullable,
  `years_of_experience` default 0). Column names are snake_case mappings of the
  camelCase entity properties.
- Migrations live in `packages/db/migrations/Migration<timestamp>.ts` next to the
  committed snapshot `.snapshot-devmentor.json`, run transactionally, and are
  generated with `npm run db:migration:create -- --name <x>`. The integration harness
  pins `MIKRO_ORM_MIGRATIONS_SNAPSHOT_NAME=.snapshot-devmentor` so a test run never
  creates a second snapshot.
- The seeder `packages/db/src/seeders/database.seeder.ts` creates the admin-list fixture
  (`ada@devmentor.dev`, `Ada Lovelace`) with a mentor profile
  (`Systems & algorithms mentor`) — `tests/integration/admin.integration.test.ts` asserts
  on those exact cells — plus the mock personas the harness signs in as
  (`mock-mentee@`, `mock-mentor@`, `mock-operator@devmentor.test`), whose addresses must
  stay `<githubLogin>@devmentor.test` or a mock sign-in creates a second row instead of
  linking. Ada's address is deliberately unreachable that way; the seeder's docblock says
  why.

**Breaking:** dropping or renaming a table or column; tightening a constraint that
existing rows may violate; editing an already applied migration or the snapshot by
hand; changing the seeded values the integration test asserts on.

**Required path:** a new migration with both `up` and `down`, exercised in both
directions; a rollback plan in the PR body; renames as expand-then-contract (add the
new column, backfill, switch the code, drop the old column in a later PR); the seeder
and the integration test updated together; `risk-high` plus `needs-qa` per `SDLC.md`.

### 4. Configuration and environment

Variables, as listed in `.env.example`: `NODE_ENV`, `APP_NAME`, `LOG_LEVEL`,
`DATABASE_URL` (takes precedence), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_IDLE_MS`, `DB_DEBUG`. Two zod
schemas describe them, `packages/core/src/config/env.ts` for the app and
`packages/db/src/env.ts` for the MikroORM CLI, and they must agree. The harness sets
`NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, and pool sizes in
`tests/integration/environment.ts`; `.github/workflows/ci.yml` sets
`NEXT_TELEMETRY_DISABLED`.

**Breaking:** a new variable without a default; renaming or removing a variable;
changing a default in a way that changes runtime behavior; dropping the
`DATABASE_URL` precedence.

**Required path:** both schemas, `.env.example`, `README.md`, the CI workflow, and the
harness environment updated in the same PR; a default wherever one is sensible.

### 5. npm scripts and CI check names

The root `package.json` scripts are this repository's command-line interface. They are
referenced by `README.md`, `AGENTS.md`, `.github/workflows/ci.yml`,
`.ai/agentic.config.json` (`validation.commands`), `SDLC.md`, `openmercato.toml`
(`scripts/preview.sh` runs `npm run dev`), and `tests/integration/run.sh` and
`run.ps1`. The CI job names `Build`, `Lint`, `Unit tests`, and `Integration tests` are
what the branch ruleset requires.

**Breaking:** renaming or removing a script; renaming a CI job.

**Required path:** update every reference above in the same PR; for a job rename, a
maintainer updates the ruleset before the PR merges, otherwise the PR blocks itself.

### 6. Domain events (`packages/core/src/events/event-map.ts`)

Event ids follow `concept.entity.action`. Today: `auth.user.created` with payload
`{ userId, email }`, subscribed in `packages/core/src/container/container.ts`.

**Breaking:** renaming an event id; removing or retyping a payload field.

**Required path:** add the new event, move subscribers, remove the old event in a later
PR; adding a payload field is additive.

### 7. Session and CSRF conventions

The session cookie name `devmentor_session` and the `Role` union live in
`packages/core/src/http/auth.ts`; the CSRF header `x-devmentor-request` is set by
`apiCall` in `packages/ui/src/backend/api/apiCall.ts`. Real session verification and
the server-side header check are not implemented yet; every guarded route currently
denies.

**Breaking:** once auth ships, renaming the cookie or the header, or changing the
`Role` values.

**Required path:** change `core/src/http/auth.ts` and `ui/src/backend/api/apiCall.ts`
together, with an integration scenario covering the denied path.

### 8. Product decisions (`.ai/specs/product-brief.md`)

The Non-goals, Business rules, and Decisions tables carry stable ids, owners, and a
review-by date. A PR that builds what a non-goal excludes, or contradicts a rule or a
decision, is a review blocker unless the same PR carries a superseding entry approved
by the entry's owner. `SDLC.md` describes the mechanism.

## How to make a breaking change

1. Name the surface and the entry above in the PR body under a "Breaking changes"
   heading, and say who is affected and how they migrate.
2. Update this file in the same PR when the surface itself changes shape.
3. Update every in-repo consumer in the same PR; the validation gate
   (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`) and the CI
   integration check are the proof.
4. Prefer expand-then-contract over a single cut for schema and export renames.
5. Label the PR `risk-high` where `SDLC.md` says so (schema migrations, shared
   contract surfaces, auth, money) and get a second reviewer.

## What is not protected

Internal, unexported helpers; the markup of the admin and public pages beyond the
semantics the integration tests assert on (the headings `Dashboard` and `Users`, the
link `Users`, the text `Connected`, the seeded table cells, and the landing heading
`Grow faster with the right mentor.`); Tailwind class choices; and the placeholder
`User` and `MentorProfile` fields, which `README.md` describes as a demo model. Even
those change through migrations and tests, only without the breaking-change paperwork.

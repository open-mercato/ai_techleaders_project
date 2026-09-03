# Code review rules

How a pull request in this repository is reviewed. Humans apply these rules by hand;
the `om-code-review` skill (and therefore `om-auto-review-pr`) applies them
automatically because this file sits at the repo root. It complements `AGENTS.md`
(how to work here) and `.ai/specs/2026-09-01-engineering-standards.md` (why the
structure is the way it is). When the two disagree, the spec wins and this file gets a
fix.

The repository is an npm-workspaces monorepo: Next.js 16 App Router + React 19,
TypeScript 5 strict, MikroORM v7 on PostgreSQL, awilix for dependency injection, zod
for every input and env schema, pino for logs, Tailwind v4 on public pages and
shadcn-ui in `@devmentor/ui` for `/admin/*`. Packages ship TypeScript source and are
transpiled by Next.

## Review priorities

Read the diff in this order. A finding higher on the list outranks everything below it.

1. **Correctness.** The change does what its ticket or spec says, and nothing else.
   Every new or changed branch has a unit test; a bug fix ships a regression test that
   fails on the pre-fix code. Services return DTOs (plain objects), never MikroORM
   entities, across the API boundary. Anything touching the database is a dynamic
   route or page (`export const dynamic = "force-dynamic"`) and degrades to a visible
   "unavailable" state when the database is down: the app must build and boot with no
   database reachable.
2. **Security.** Auth is enforced server-side on every route that is not explicitly
   public; hiding a button in the UI is not enforcement. Mutations check ownership of
   the specific record, not just "is logged in". Security decisions fail closed: an
   unexpected error inside an auth or ownership check denies. Write endpoints parse an
   explicit zod schema and never spread the raw request body into `em.create()` or
   `em.assign()`. No secret, token, password, or JWT reaches a log line, an error
   response, or the client. No raw SQL with interpolated input. Money is recomputed
   server-side; a client-supplied price is never persisted as-is.
3. **Contracts.** The protected surfaces in `BACKWARD_COMPATIBILITY.md` (API
   envelope and error codes, the `/api/health` payload, package exports, database
   schema, environment variables, npm script and CI check names) change only through
   the path that file names. Product decisions in `.ai/specs/product-brief.md`
   (Non-goals, Business rules, Decisions) are protected the same way, per `SDLC.md`.

## Repo-specific checks

### Package boundaries

- The dependency graph is `app -> core -> db`, with `ui` imported by `app` only.
  ESLint (`eslint.config.mjs`, `no-restricted-imports`) fails the build on a violation;
  a PR that loosens those rules is a blocker.
- Only `packages/db` imports `@mikro-orm/*`. `core` never imports `next`, `react`, or
  `@devmentor/ui`. `ui` never imports `core` or `db`.
- The API envelope is declared twice on purpose (`packages/core/src/http/apiHandler.ts`
  and `packages/ui/src/backend/api/types.ts`). A change to one without the other is a
  blocker. A shared `packages/shared` package is an ask-first architecture change, not
  something to add in passing.

### Domain concept convention

- A concept (`auth`, `mentors`, `bookings`, ...) is a same-named sub-folder under
  `packages/db/src/entities/`, `packages/core/src/services/`,
  `packages/core/src/validators/`, and `packages/app/src/app/api/`. An entity without a
  service, or a service without its entity, is a finding.
- No `modules/`, no per-concept `setup.ts` or `acl.ts`, no auto-discovery, no empty
  scaffolded folders. A new service is one explicit line in
  `packages/core/src/container/container.ts` (`asClass(...).scoped()`) and one in
  `packages/core/src/container/cradle.ts`.
- Domain events are entries in `packages/core/src/events/event-map.ts`, named
  `concept.entity.action` in past tense, emitted from the service after a successful
  mutation. In-process only: a PR introducing a queue or worker is out of scope.

### HTTP layer (`packages/core/src/http/`, `packages/app/src/app/api/`)

- A `route.ts` is configuration, not logic: plain CRUD uses `makeCrudRoute`, a
  workflow endpoint wraps its handler in `apiHandler`. A bare `try/catch` plus
  `NextResponse.json` in a route is a finding; `/api/health` is the one pre-existing
  exception and stays a plain probe.
- Errors are thrown as `AppError` subclasses from `packages/core/src/http/errors.ts`
  (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
  `ConflictError`, `ValidationError`). A service never builds a `Response`.
- Guarded routes call `requireSession`, `requireRole`, or `assertOwnership` from
  `packages/core/src/http/auth.ts` before touching a service. `readSession` currently
  returns `null` by design (fail closed until the `auth` concept lands); the PR that
  wires real session verification is `risk-high` and needs a second reviewer.
- Collection routes are non-dynamic, so Next passes no `params`; helpers guard
  `ctx.params` before reading it (see `.ai/lessons.md`, 2026-09-02).
- Request-scoped work goes through `withScope(fn)`; nothing resolves the root
  container directly from a handler.

### Client layer (`packages/ui/src/backend/`, `packages/app/src/app/**/page.tsx`)

- `apiCall` / `apiCallOrThrow` are the only sanctioned `fetch()` call sites. A raw
  `fetch` in a page or component is a finding.
- Create and edit screens use `CrudForm` bound to the same zod schema the route
  validates with (`packages/core/src/validators/<concept>/`). List screens use
  `DataTable`. Loading, error, and empty states come from
  `packages/ui/src/backend/feedback/`. A bespoke version of any of these needs a stated
  reason in the PR description.
- shadcn primitives land in `packages/ui/src/components/ui/` only via
  `npx shadcn@latest add <component>` run inside `packages/ui`; hand-written primitives
  are a finding. Concept-specific components go to `packages/ui/src/components/<concept>/`;
  a component used by one page stays next to that `page.tsx`.
- Public pages use Tailwind utilities; `/admin/*` uses `@devmentor/ui` components and
  the tokens in `packages/ui/src/tokens.css`. No hardcoded colors where a token exists.

### Data layer (`packages/db/`)

- Entities use `defineEntity` through `defineSingletonEntity` (globalThis registry),
  spread `baseProperties` (uuid id, `createdAt`, `updatedAt`), and use a per-property
  thunk for every cross-entity relation. Each new entity is registered in
  `packages/db/src/entities/index.ts`.
- Every schema change ships a migration generated with `npm run db:migration:create`
  into `packages/db/migrations/`. An applied migration or the committed snapshot is
  never edited by hand. Migrations run transactionally; a PR must state how the change
  rolls back.
- `em.persist(entity)` then `await em.flush()`; `persistAndFlush` does not exist in v7.
- Any check-then-write on shared state (slot availability, booking status, payment
  confirmation) runs inside a database transaction and, where the invariant allows it,
  a unique constraint. A read-then-write with a race window is a blocker for
  bookings and payments.

### Configuration

- `process.env` is read only by `packages/core/src/config/env.ts` and
  `packages/db/src/env.ts`; both zod schemas describe the same database variables and
  change together. A new variable appears in `.env.example` with a default or a clear
  comment. `tests/integration/environment.ts` is the single documented exception.
- Secrets never enter the repository; `.env` stays ignored.

### Tests and coverage

- Unit tests sit next to their source as `*.test.ts` / `*.test.tsx` and run through
  Vitest (`vitest.config.mts`). Every new or changed production file is added to
  `coverage.include` there in the same PR, and `npm run test:unit:coverage` proves 100%
  statements, branches, functions, and lines for it. Narrowing exclusions or dropping a
  file from the coverage scope to pass the gate is a blocker.
- Integration tests live under `tests/integration/`, own their infrastructure
  (PostgreSQL Testcontainer on a random port, migrations, seeder, production Next build
  on a random port), assert on the agent-browser accessibility snapshot (roles and
  text, never guessed CSS selectors), capture screenshots at key assertions, and close
  every browser session in `finally`. A test that depends on a fixed port, the
  developer database, or shared data is a finding.
- Integration coverage supplements unit coverage; it never replaces it.

### Code quality

- No `any`; narrow `unknown` at runtime. Extensionless relative imports inside
  packages (`./foo`, not `./foo.js`). No empty `catch`; log through the shared pino
  logger with context, or rethrow. No `console.log`, dead code, or commented-out code
  in the diff. Named constants instead of magic numbers, with the reason for the value
  where it is not obvious.
- The diff traces entirely to the PR's stated purpose: no drive-by renames or
  formatting passes mixed into a behavioral change.

### Spec-driven development artifacts

- Nontrivial work has a spec in `.ai/specs/` (`YYYY-MM-DD-slug.md`) that the PR links.
  A spec moves to `.ai/specs/implemented/` only after the coverage proof above. A
  correction that should persist is recorded in `.ai/lessons.md`; a standing rule
  change also updates `AGENTS.md` in the same PR.

## Validation gate

Every PR passes, in this order (the same list as `validation.commands` in
`.ai/agentic.config.json`):

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit:coverage`
4. `npm run build`

Step 3 is the coverage run rather than plain `npm run test`, so the gate proves the
100% per-file requirement above locally instead of deferring it to CI.

CI (`.github/workflows/ci.yml`) runs the same `npm run test:unit:coverage` as the
"Unit tests" check and `npm run test:integration` as the "Integration tests" check. A
PR that crosses the app, database, API, or browser boundary is expected to have run
both locally (Docker plus `npm run test:browser:install`) before review.

## Severity guidance

- **Blocker** (the PR cannot merge as-is): any item under Security above; a
  dependency-direction violation or a loosened ESLint boundary; a protected surface
  changed without the path `BACKWARD_COMPATIBILITY.md` requires; a failing validation
  gate; new or changed behavior without unit tests, or a production file missing from
  `coverage.include`; an edited applied migration; a race window in a booking or
  payment flow; a PR that builds what a product non-goal excludes without a
  superseding decision.
- **Major** (must be fixed before approval, one round expected): bespoke fetch, form,
  table, or error handling without a stated reason; a bug fix without a regression
  test; an ORM entity leaking through the API; a database-touching route or page that
  is not `force-dynamic`; `process.env` read outside the two schemas; a spec or
  `AGENTS.md` left out of date by the change; cookie or rate-limit protections
  weakened on an auth path.
- **Minor** (note it, do not block): naming, comment wording, formatting, small
  duplication that does not branch, test readability.

Verdict mapping: any blocker or major finding is `changes-requested`; only minors is an
approval, and the pipeline label moves from `review` to `merge-queue`. Apply
`needs-qa` to user-facing changes and `skip-qa` to docs-, CI-, or test-only changes,
never both. Infer `risk-high` for auth, sessions, data scoping, money, schema
migrations, and shared contract surfaces, and require the evidence `SDLC.md` lists for
it.

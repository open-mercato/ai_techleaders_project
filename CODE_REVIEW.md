# Code review rules — DevMentor

The review standard for this repository. `om-code-review` (and therefore `om-auto-review-pr`) reads this file automatically and applies it on top of its built-in checklist; human reviewers use the same rules so an agent review and a human review reach the same verdict.

Everything below is derived from what this codebase actually does — the layering enforced in `eslint.config.mjs`, the HTTP layer in `packages/core/src/http/`, the MikroORM v7 patterns in `packages/db/src/`, and the conventions recorded in `AGENTS.md` and `.ai/lessons.md`. When a rule here and `AGENTS.md` disagree, `AGENTS.md` is the source of truth and this file is the one to fix.

## Review priorities, in order

1. **Correctness** — does the change do what its PR/spec says, including the error and edge paths?
2. **Security and access control** — input validation, authorization, data scoping, secret handling.
3. **Contract stability** — does it break a surface listed in `BACKWARD_COMPATIBILITY.md` without the required path?
4. **Test coverage** — 100% per-file on new/changed production code, plus a regression test for every bug fix.
5. **Architecture and reuse** — layering, and use of the shared API/UI layers instead of hand-rolled equivalents.
6. **Clarity** — naming, comments that explain *why*, and dead-code removal.

A finding is reported at the highest priority it legitimately belongs to; do not downgrade a security or contract finding to a style nit.

## Repo-specific checks

### Layering and dependency direction

- The allowed graph is `app → core → ui` and `app → core → db`. `ui` imports neither `core` nor `db`; `db` imports nothing from the workspace. A violation fails `npm run lint` via `no-restricted-imports` — if a PR touches `eslint.config.mjs` to relax a `boundary(...)` rule, that is a **blocker** needing explicit maintainer sign-off, not a lint fix.
- Domain code is organized by concept folder (`auth`, `mentors`, `bookings`, …) repeated across `db/src/entities/<concept>/`, `core/src/services/<concept>/`, `core/src/validators/<concept>/`, and `app/src/app/api/<concept>/`. Check that a new concept uses the same folder name in every layer, and that no empty concept folders were scaffolded ahead of their first file.
- New reusable components go to exactly one designated home: shadcn primitives to `ui/src/components/ui/` (added with `npx shadcn@latest add`, never hand-written), concept-agnostic panel patterns to `ui/src/backend/<category>/`, concept-shaped components to `ui/src/components/<concept>/`, and single-consumer components colocated with their `page.tsx`. A component in the wrong home is a real finding — it is how the library stays navigable.

### HTTP routes and services

- **No hand-rolled routes.** A `route.ts` is configuration, not logic: plain CRUD goes through `makeCrudRoute`, anything else through `apiHandler`. A bare `try/catch` plus `NextResponse.json` in a route is a finding, because it bypasses the envelope, the `AppError` status mapping, and the unexpected-error logging in `apiHandler`.
- **Services throw, routes don't build responses.** Domain services return DTOs and throw the typed errors from `core/src/http/errors.ts` (`BadRequestError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `ValidationError` 422). A new ad-hoc error class or a raw `throw new Error()` on a path that reaches a client is a finding: the former loses the status mapping, the latter degrades to a generic 500.
- **Every input is validated with a Zod schema** from `core/src/validators/<concept>/`, passed into the route helper — never parsed inline in a handler and never trusted from the request body.
- **Authorization is explicit.** Check that a route which should be protected passes `authorize` (`requireSession` / `requireRole` / an ownership assertion from `core/src/http/auth.ts`). A route that reads or writes user-scoped data without one is a security finding. `/api/users` is currently and intentionally public as the migration regression check — any *new* route copying that exemption needs a stated reason.
- **The response envelope is `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`.** It is a shape convention duplicated by design in `core/src/http/apiHandler.ts` and `ui/src/backend/api/types.ts` because `ui` must not import `core`. A change to one side without the other is a finding; consolidating them into a shared package is an ask-first architectural change, not a drive-by refactor.
- **Client code never calls `fetch` directly.** Pages and components go through `apiCall` / `apiCallOrThrow`, forms through `CrudForm`, lists through `DataTable`, and loading/error/empty states through `ui/src/backend/feedback/`. A raw `fetch()` outside `apiCall.ts` is a finding.
- **Nothing reads `process.env` directly.** Config comes from the zod schemas in `core/src/config/env.ts` or `db/src/env.ts`. The sole exception is the integration harness (`tests/integration/environment.ts`), which may inherit the parent environment to pass ephemeral test configuration to child processes.

### Database and MikroORM v7

- Entities use `defineEntity` with the `p` property builders — **there are no decorators in MikroORM v7**. Cross-entity relations must use a per-property thunk (`user: () => p.oneToOne(User)…`) so the reference resolves lazily at discovery time.
- New entities must be registered through `defineSingletonEntity` (`db/src/entities/define.ts`) and exported from `db/src/entities/index.ts`. Skipping the singleton registry is a subtle **blocker**: Next evaluates the module in several graphs, and a second schema instance silently breaks `populate`.
- `em.persistAndFlush()` no longer exists — expect `em.persist(e); await em.flush()`.
- An entity change must ship with a migration (`npm run db:migration:create -- --name <x>`). An entity diff with no migration is a blocker; a migration that drops or renames a column needs the `BACKWARD_COMPATIBILITY.md` path.
- Request-scoped work goes through `withScope(fn)` so the forked `EntityManager` is disposed. A long-lived `em` captured across requests is a correctness finding.
- Any page or route touching the database must be `export const dynamic = "force-dynamic"` and must degrade gracefully — **the app must build and boot with no database reachable**. A build-time DB read is a blocker; CI's Build job runs without a database precisely to catch it.

### Frontend

- Public/marketing pages use Tailwind utilities; `/admin/*` pages use shadcn-ui components from `@devmentor/ui`. Mixing the two conventions in one page is a finding.
- Use extensionless relative imports inside packages (`./foo`, not `./foo.js`) — Turbopack does not rewrite `.js` → `.ts`.
- Packages ship TypeScript source consumed through `exports` and compiled by Next's `transpilePackages`; a PR introducing a per-package build step changes the architecture and needs sign-off.

### Tests

- Every new or changed production file needs unit tests at **100% statements, branches, functions, and lines**, and must be added to `coverage.include` in `vitest.config.mts` **in the same change**. A PR that adds production code without extending `coverage.include` is a blocker even when the coverage run is green — it is green only because the file is unmeasured. Narrowing exclusions or removing a file from coverage scope to pass the gate is never acceptable.
- Unit tests live next to their source as `*.test.ts(x)` and must cover success, error, validation, authorization, and edge branches.
- Every bug fix needs a regression test that fails without the fix. Ask for the evidence if the PR does not show it.
- Integration/browser tests supplement and never replace unit tests. They must own their data and infrastructure: Testcontainers, random ports, migrations applied, prerequisites seeded, and browser sessions/app processes/containers cleaned up in `finally` on success and failure alike. A test depending on the developer database, a fixed port, or shared demo state is a finding.
- Browser scenarios use the pinned local `agent-browser` executable, observe the accessibility tree first, and assert semantic roles and text rather than guessed CSS selectors.

### Process artifacts

- Nontrivial work should reference a spec in `.ai/specs/`; a feature-sized PR with no covering spec is a finding to raise with the author. A spec moves to `.ai/specs/implemented/` only once the implementation has landed and the coverage gate proves 100%.
- Specs already in `implemented/` or `archive/` are never edited — changed requirements get a new spec.
- A nontrivial bug fix or a newly discovered gotcha should add a line to `.ai/lessons.md` (with a detail file under `.ai/lessons/` when it is long).
- Autonomous runs leave exactly one run log in `.ai/runs/` named `YYYY-MM-DD-slug.md`.

## Validation gate

A review is not complete until the gate has been run on the PR head:

- `npm run typecheck`
- `npm run lint`
- `npm run test:unit:coverage`
- `npm run build`

A non-zero exit is a **blocker** finding reported alongside the code findings, never instead of them. CI additionally runs `npm run test:integration`; a red Integration check is a blocker even when the local gate is green.

## Severity guidance

- **Blocker** — data loss or corruption, a security or authorization hole, a broken protected contract without its migration path, a build/gate failure, an entity change without a migration, a missing singleton registration, production code outside `coverage.include`, or a relaxed lint boundary.
- **Major** — a real bug on a plausible path, a missing test for a new branch, hand-rolled fetch/validation/error handling that bypasses the shared layers, a DB read on a static path, or an unhandled error path that surfaces a 500 to the user.
- **Minor** — naming, structure, duplication, a component filed in the wrong home, or a missing comment on non-obvious code.
- **Nit** — formatting and wording preferences. Never block a PR on nits; file them as follow-ups if they are worth keeping.

State the concrete failure a finding causes — the input or state, and the resulting wrong behavior. A finding that cannot be stated that way is a suggestion, not a defect, and should be labeled as one.

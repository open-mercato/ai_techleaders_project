# AGENTS.md

Instructions for any AI agent (Claude Code, other CLIs, autonomous runs) working in
this repository.

## Project

**DevMentor** — a platform connecting developers with mentors. It is an npm-workspaces
monorepo built on the latest Next.js + TypeScript + React.

### Tech stack

| Concern            | Choice                                             |
| ------------------ | -------------------------------------------------- |
| Framework          | Next.js 16 (App Router, Turbopack) + React 19      |
| Language           | TypeScript 5 (strict), ESM everywhere              |
| Database           | PostgreSQL                                          |
| ORM                | MikroORM v7 (PostgreSQL driver) — migrations + pool |
| Dependency injection | awilix v13 (`PROXY` mode, typed `Cradle`)        |
| Config validation  | zod                                                |
| Logging            | pino                                               |
| Frontend styling   | Tailwind CSS v4 (public/marketing pages)           |
| Backend/admin UI   | shadcn-ui components (in `@devmentor/ui`)          |
| Package manager    | npm workspaces (Node ≥ 24)                          |

### Monorepo layout

Everything lives under `packages/*`. The dependency graph is strictly one-way:

```
app ──> core ──> db
 └────> ui

packages/
  app    @devmentor/app    Next.js host + composition root (the only package that
                           may import every other package)
  core   @devmentor/core   config (zod), logger (pino), awilix container, domain
                           services. Knows about db; never imports react/next/ui.
  db     @devmentor/db     MikroORM config, entities, migrations, seeders. The leaf —
                           the only package that imports @mikro-orm/*. Knows nothing
                           about the others.
  ui     @devmentor/ui     shadcn-ui primitives + Tailwind design tokens.
                           Presentational only — no core/db imports.
```

These boundaries are enforced by ESLint (`no-restricted-imports` in
`eslint.config.mjs`); a cycle-introducing import fails `npm run lint`.

### Domain concept convention

Domain code is not organized into `modules/`. Each concept (`auth`, `mentors`,
`availability`, `bookings`, `payments`, `messages`, `favorites`, `reviews`, ...) is a
same-named sub-folder repeated across the layers that need it:

- `packages/db/src/entities/<concept>/<name>.entity.ts`
- `packages/core/src/services/<concept>/<name>.service.ts`
- `packages/core/src/validators/<concept>/` (shared Zod schemas, when needed)
- `packages/app/src/app/api/<concept>/route.ts` and the matching `page.tsx` under
  the relevant persona route group

Create a concept folder only when its first file is added — never scaffold empty
ones. This is a directory convention, not a module runtime: there is no per-concept
setup/ACL/auto-discovery. See `.ai/specs/2026-09-01-engineering-standards.md` for the
full naming table and the payments-port/event-emitter patterns.

Event IDs follow `concept.entity.action` (e.g. `bookings.booking.created`) and are
emitted through the typed emitter in `packages/core/src/events`, registered on the
`Cradle` — this is in-process only; there is no queue/worker in this project.

### Reusable API & UI layer

Every route and every page reuses two shared layers instead of re-implementing
fetch/validation/auth/error-handling per feature:

- `packages/core/src/http/` — `errors.ts` (typed `AppError` hierarchy),
  `apiHandler.ts` (wraps a route: catches `AppError`s, maps to status + JSON
  envelope, logs unexpected failures), `makeCrudRoute.ts` (schema + service in,
  `{ GET, POST, PUT, DELETE }` out, for plain CRUD resources), `auth.ts`
  (`requireSession`, `requireRole`, ownership assertions).
- `packages/ui/src/backend/` — `api/apiCall.ts` (the only sanctioned `fetch()` call
  site), `forms/CrudForm.tsx`, `tables/DataTable.tsx`,
  `feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx`.

New reusable components have one designated home each — never scattered ad hoc:

1. Shadcn primitive → `ui/src/components/ui/` (via `npx shadcn@latest add`, never
   hand-written).
2. Generic, concept-agnostic panel pattern → `ui/src/backend/<category>/`.
3. Component tied to one concept's domain shape → `ui/src/components/<concept>/`,
   named after the same concept folder used in `db`/`core`.
4. Used by exactly one page → colocate next to that `page.tsx` until a second
   consumer appears.

The API envelope (`{ ok, data }` / `{ ok, error }`) is a *shape convention*, not a
shared type: `core/src/http` and `ui/src/backend/api` each declare their own matching
type because `ui` must not import `core`. `/api/users` + `/admin/users/page.tsx` are
the reference example every new concept copies. See
`.ai/specs/2026-09-01-engineering-standards.md` for the full rationale.

**A navigated route redirects; a fetched route returns the envelope.** A route a browser
navigates to directly — the two OAuth `GET`s, the email-verification `GET` — catches its
own failures and returns a redirect `Response`, which `apiHandler` passes through
unchanged. Someone who clicked "Sign in with GitHub" must never be shown a JSON envelope
rendered as a page. Every other route returns the envelope and is read through `apiCall`.
Decide which kind a new route is before writing it; the two error paths are not
interchangeable.

**Every state-changing route is JSON-only.** `apiHandler` requires the CSRF header
`x-devmentor-request` on every method other than `GET`, `HEAD` and `OPTIONS`, so
`makeCrudRoute`'s mutating verbs inherit the check and no route can forget it. Mutations
are therefore called through `apiCall` or `CrudForm`, never a native HTML form — a form
post cannot set a header, so it is refused with 403 `forbidden` before the route body
runs. The one opt-out, `apiHandler(logic, { csrf: false })`, is reserved for the payment
webhook, which authenticates by verifying a signature. See `BACKWARD_COMPATIBILITY.md` §7.

### Scripts (run from the repo root)

- `npm run setup` — one-command installer: `npm install`, `.env` from `.env.example`,
  PostgreSQL available, migrations, seed. **Idempotent** — every step reports itself as
  `ran` or `skipped`, an existing `.env` is never overwritten, and the dev server is
  deliberately not started (`npm run dev` never exits). **Docker is a fallback, not a
  requirement**: setup TCP-probes the configured address (`DATABASE_URL`, else
  `DB_HOST`/`DB_PORT`, environment before `.env`) and reuses any PostgreSQL already
  listening; Compose is only used when nothing answers. Implementation in
  `scripts/setup/` (plain Node ESM, `node:*` built-ins only, so it runs on a fresh
  clone) — pure decisions in `steps.mjs`, all I/O behind the injectable effects in
  `effects.mjs`, ordering in `run.mjs`.
- `npm run dev` — start the Next.js app (`@devmentor/app`).
- `npm run build` / `npm run start` — production build / serve (force `NODE_ENV=production`).
- `npm run typecheck` — `tsc --noEmit` across all packages.
- `npm run lint` — ESLint (includes the dependency-direction rules).
- `npm run test:unit` — run TypeScript unit tests with Vitest.
- `npm run test:unit:coverage` — run unit tests and enforce per-file 100% coverage.
- `npm run storybook` — build the prototype and start the local component catalogue.
- `npm run build-storybook` — build the prototype and static component catalogue.
- `npm run typecheck:storybook` — check catalogue configuration and examples.
- `npm run prototype` — rebuild the preview from `prototypes/devmentor-journey/`.
- `npm run typecheck:prototype` / `npm run test:prototype` — check prototype types and regressions.
- `npm run test:integration` — create ephemeral PostgreSQL with Testcontainers,
  build/start the app, and run the agent-browser scenarios.
- `npm run test:browser:install` — install agent-browser's Chrome runtime locally
  (use `test:browser:install:ci` on Linux CI to install system dependencies too).
- `npm run db:up` / `npm run db:down` — local Postgres via `docker-compose.yml`.
- `npm run db:migration:create -- --name <x>` — generate a migration from entity diff.
- `npm run db:migrate` / `npm run db:migrate:down` — apply / revert migrations.
- `npm run db:seed` — run the default seeder.

### Configuration

- Copy `.env.example` to `.env`. `.env` is git-ignored; defaults match
  `docker-compose.yml` (`devmentor` / `devmentor` / `devmentor`).
- All env access funnels through zod schemas — `@devmentor/core` (`config/env.ts`) for
  the app, `@devmentor/db` (`env.ts`) for the MikroORM CLI. **Nothing under `packages/`
  reads `process.env` directly.** There are exactly two documented exceptions, both
  outside `packages/`:
  - `tests/integration/environment.ts` — inherits the parent environment to pass
    ephemeral test configuration to migration/build/app child processes.
  - `scripts/setup/effects.mjs` — `npm run setup` runs on a fresh clone *before*
    `npm install`, so it cannot import zod. It reads `process.env`, `process.version`,
    and `process.platform` behind the injectable `SetupEffects` adapter, and
    re-implements the `DATABASE_URL`-over-`DB_*` precedence in `steps.mjs`
    (`resolveDatabaseTarget`). Keep that precedence in step with the two zod schemas.

### Conventions & gotchas (learned the hard way — see `.ai/lessons.md`)

- **Packages ship TypeScript source**, not built JS. They are consumed via `exports`
  → `./src/*` and compiled by Next's `transpilePackages`. There is no per-package
  build step.
- **Use extensionless relative imports** inside packages (`./foo`, not `./foo.js`).
  Turbopack does not rewrite `.js`→`.ts` the way `tsc` does; extensionless works for
  `tsc` (bundler), Turbopack, and `tsx` alike.
- **MikroORM v7 has no decorators** in `@mikro-orm/core`. Define entities with
  `defineEntity` + the `p` (`defineEntity.properties`) builders. For cross-entity
  relations use a **per-property thunk** (`user: () => p.oneToOne(User)...`) so the
  reference resolves lazily at discovery time (avoids circular-import + wrapping bugs).
- **Entities are registered as `globalThis` singletons** (`entities/define.ts`) so the
  same schema object is shared across Next's RSC/SSR/route module graphs. Without this,
  queries pass a different schema instance than was discovered and `populate` breaks.
- **`MikroORM.init()` does not connect in v7** — `getOrm()` calls `orm.connect()`
  explicitly and does not cache a failed connection (so the app recovers if the DB
  comes back). The ORM and awilix container are cached on `globalThis` to survive HMR.
- **`em.persistAndFlush()` was removed** — use `em.persist(e); await em.flush()`.
- Touch the DB only in **dynamic** routes (`export const dynamic = "force-dynamic"`)
  and degrade gracefully; the app must build and boot with no database reachable.
- **Public pages use Tailwind utilities; `/admin/*` pages use shadcn-ui components**
  from `@devmentor/ui`. Add shadcn components with `npx shadcn@latest add <c>` run in
  `packages/ui` (its `components.json` is committed).
- Request-scoped work goes through `withScope(fn)` from `@devmentor/core`, which opens
  an awilix scope with a forked `EntityManager` and disposes it afterward.
- **Never hand-roll fetch / validation / error-handling / CRUD.** Server routes use
  `makeCrudRoute`/`apiHandler` (no bare `try/catch` + `NextResponse.json`); services
  throw the typed `AppError`s and return DTOs, never build responses. Client pages
  fetch through `apiCall`/`apiCallOrThrow` (never raw `fetch`), forms use `CrudForm`,
  lists use `DataTable`, and loading/error/empty states use the `feedback/` components.
- **Collection routes are non-dynamic**, so Next passes no `params` — CRUD helpers
  guard `ctx.params` before reading it.
- **Logs are redacted at the logger, but do not rely on it.** `createLogger`
  (`packages/core/src/logger.ts`) censors `password`, `passwordHash`, `token`,
  `authorization` and `cookie` at the top level and one and two levels below any key, so
  `err.password` and `req.headers.authorization` are covered. That is the backstop for the
  log call that forgets; the rule is still to log ids and outcomes, never credentials, and
  `fetchJson` never hands a request body or request headers to a logger at all.

### Design-system rules confirmed by the user

- Form footer actions align right, with the secondary/Cancel action before the
  primary submit action in DOM and visual order. Authentication actions span the
  field width; provider alternatives use neutral styling and back navigation is
  visually separate. Preserve this order when actions wrap on mobile.

- Read `packages/ui/.storybook/Guidelines.mdx` before composing screens.
  Use clear visual hierarchy, comfortable reading widths and generous
  paragraph/component spacing; long prose may use 16px/28px while controls retain
  the compact DS scale.
- Present short comparable facts, such as a session length and its allowed price
  range, as separate neutral, noninteractive chips. Keep units/currency explicit
  and allow chips to wrap on mobile.
- Homepage feature chips use generous padding, semibold blue labels and decorative
  icons. Keep this emphasis distinct from neutral metadata and semantic statuses.
- Write visible copy in direct, specific language using the humanizer skill.
  Avoid generic promises and theatrical slogans; preserve product facts and useful
  validation/recovery instructions. Keep the current UI language unless requested.
- Never use dots, middle dots or bullet dots as inline metadata separators.
  Separate facts with spacing, new lines or chips. Normal sentence punctuation
  remains allowed. The reusable examples live in Storybook's usage guidelines.
- The DevMentor wordmark uses bundled DM Mono; ordinary UI text stays in Inter.
  The blue four-point star is the favicon. Technology chips retain text labels
  alongside decorative icons. Mentor ratings and reviews are included as
  presentational DS components; persistence and eligibility belong to the backend.

## Testing requirements

- **Every new feature must have unit tests covering 100% of its new or changed
  production behavior:** statements, branches, functions, and lines, per file. A
  feature is not complete and its spec must not move to `implemented/` until
  `npm run test:unit:coverage` proves all four metrics are 100%.
- Add each new or changed production file to `coverage.include` in
  `vitest.config.mts` in the same change. Coverage that only measures files imported
  by tests is bypassable and does not satisfy this rule. Do not narrow exclusions or
  remove a file from the coverage scope to make the gate pass.
- Unit tests live next to their source as `*.test.ts` / `*.test.tsx`. Test every
  success, error, validation, authorization, and edge-case branch. Every bug fix
  requires a regression test that fails without the fix.
- Integration/browser tests **supplement but never replace unit tests** or the 100%
  unit-coverage requirement. Add integration coverage whenever behavior crosses the
  app/database/API/browser boundary.
- Integration tests must own their data and infrastructure. Use Testcontainers with
  random ports, apply migrations, create/seed prerequisites, and clean up browser
  sessions, app processes, and containers on success and failure. Never depend on the
  developer database, fixed ports, or shared/demo state.
- Use the pinned local `agent-browser` executable for browser scenarios. Observe the
  live accessibility tree first, assert semantic roles/text rather than guessed CSS,
  capture screenshots at key assertions, and close each isolated session in
  `finally`.
- The integration harness under `tests/integration/` is one of the two exceptions to
  the direct-environment-access rule (the other is `scripts/setup/` — see
  Configuration above): `environment.ts` may inherit the parent process environment
  only to pass ephemeral test configuration to migration/build/app child processes.
  Application and package source must still use the zod config modules.

GitHub Actions runs Build, Lint, Unit tests, and Integration tests independently on
every pull request. A workflow result becomes merge-blocking only when the repository
ruleset requires those four exact check names.

### Testing React components and pages

- **Server components are invoked, not rendered.** `page.tsx` and `layout.tsx` are async
  functions returning an element tree. Test them by calling the exported function and
  asserting on the tree it returns — no DOM, no renderer, the default `node` environment.
- **Client components use Testing Library under jsdom.** Render `CrudForm`,
  `WorkflowAction`, `AppShell` and the other `'use client'` components with
  `@testing-library/react`. jsdom is opt-in per file through a `// @vitest-environment jsdom`
  pragma on the first line; `node` stays the project-wide default, so no existing test
  changes.
- **A guarded page needs two mocking seams, because `redirect()` throws.** It does not
  return — it raises a framework control-flow error — so the denied path yields no tree to
  assert on. A `page.tsx` test mocks `packages/app/src/lib/session.ts`, asserts the rendered
  tree on the authorized path, and asserts a sentinel throw from the mocked guard on the
  denied one. `session.test.ts` mocks `next/navigation` instead and asserts `redirect` was
  called with the expected URL. Neither test asserts against Next internals.
- **Page-level enforcement is a recurring coverage cost.** Every guarded `page.tsx` calls the
  guard itself rather than relying on its layout, so every guarded `page.tsx` is its own
  `coverage.include` entry, and each one needs both the authorized and the redirected branch
  to clear the per-file 100% bar above. That cost repeats per page; it is not a one-time
  setup.

## Spec-Driven Development (SDD)

Nontrivial work in this repo is defined by a spec before it's implemented. All SDD
artifacts live under `.ai/`.

```
.ai/
  specs/                  active specs
    implemented/          specs whose implementation has landed
    archive/               specs that were superseded or abandoned
  runs/                   logs of autonomous AI runs
  lessons.md              index of lessons learned
  lessons/                detailed lesson write-ups
```

### Specs — `.ai/specs/`

- Naming: `YYYY-MM-DD-slug.md`, dated the day the spec was written, `slug` a short
  kebab-case description (e.g. `2026-09-01-user-auth-refresh-tokens.md`).
- Lifecycle:
  1. New/active work: file lives directly in `.ai/specs/`.
  2. Once the implementation is complete, verified, and merged: `git mv` the file into
     `.ai/specs/implemented/`.
  3. If a spec is superseded, abandoned, or no longer accurate: `git mv` it into
     `.ai/specs/archive/` instead of deleting it.
- Rules:
  - Before starting a nontrivial feature or fix, check `.ai/specs/` and
    `.ai/specs/implemented/` for a spec that already covers it.
  - If none exists, write one first for anything beyond a small/obvious change.
  - Never edit a spec after it has moved to `implemented/` or `archive/` — if
    requirements change, write a new spec instead.
  - A spec should cover: Problem/Goal, Non-goals, Approach, Acceptance criteria.

### Runs — `.ai/runs/`

- Every autonomous AI run (an agent operating on a task without a human reviewing
  each step — e.g. a workflow, an unattended long-running session) produces exactly
  one run log.
- Naming: `YYYY-MM-DD-slug.md`, dated the day the run happened.
- A run log should cover: what was requested, what was done, files touched, outcome,
  and any follow-ups left for a human or a future run.

### Lessons — `.ai/lessons.md` + `.ai/lessons/`

- `.ai/lessons.md` is a chronological index — one line per lesson, most recent first.
  Short lessons can be stated inline; anything longer gets its own file in
  `.ai/lessons/slug.md` and is linked from the index.
- Add a lesson when:
  - a nontrivial bug is fixed (what was wrong, why, the fix, how to avoid it again),
  - a project-specific gotcha or convention is discovered,
  - the user corrects an agent's approach in a way that should persist beyond the
    current session.
- Check `.ai/lessons.md` at the start of related work before repeating a known
  mistake.

### Enforcement

- Use this `.ai/` structure for specs, run logs, and lessons — don't create ad hoc
  scratch docs elsewhere in the repo for these purposes.
- Keep the `YYYY-MM-DD-slug.md` naming convention exactly as specified above.

## Working Rules

Distilled from [Boris Cherny's Claude Code
tips](https://ykdojo.github.io/claude-code-tips/content/boris-claude-code-tips).
These govern *how* you work; the SDD section above governs *what artifacts* you leave
behind.

1. **Plan first, and re-plan instead of patching.** Front-load the thinking: a
   detailed spec beats an ambiguous prompt every time. When implementation goes
   sideways, stop and revise the plan/spec rather than reactively troubleshooting on
   top of a bad foundation. For high-stakes plans, get a second opinion — have a
   subagent review the plan as a skeptical staff engineer before you write code.

2. **Capture every correction the moment it happens.** When the user corrects your
   approach, write the lesson to `.ai/lessons.md` (and update this file if it's a
   standing rule) *before* continuing the task. Rules that only live in the current
   conversation are lost; the point is that the same mistake never recurs.

3. **Promote anything repeated into a skill or command.** If you find yourself doing
   the same multi-step task more than a couple of times, propose codifying it as a
   project skill or slash command in `.claude/` instead of re-deriving the steps each
   run.

4. **Don't ship the first draft — grill it.** Before declaring work done or moving a
   spec to `implemented/`, check the diff against the spec's acceptance criteria and
   actively try to break it. If the result is merely adequate, scrap it and implement
   the elegant version rather than iterating on a mediocre base. Report failures
   plainly; never self-report success you haven't verified.

5. **Delegate breadth to subagents; keep the main context for judgment.** Push wide
   searches, multi-file reads, and independent parallel work into subagents and keep
   only their conclusions in the main thread. A clean context window is a
   correctness feature, not just a cost saving.

6. **Work locally; obtain explicit permission before any remote write.** Prepare
   and review changes locally. Never push commits, create or update remote PRs or
   issues, publish/deploy artifacts, or write changes to Figma or another external
   service without the user's explicit approval for that action. Read-only remote
   research remains allowed. A request to build or edit something locally is not
   approval to publish it.
7. **Keep session materials out of commits.** Run logs, local PR drafts, working
   references and generated previews stay local. Review the staged file list and
   commit only the requested project deliverables and their required source,
   tests and documentation.

# DevMentor — Engineering Standards & Package Structure

Date: 2026-09-01
Status: active

Grounded in the actual bootstrap  and the target
product scope (`devmentor-training-pack-first-idea`: ~9 domain concepts — auth,
mentors, availability, bookings, payments, messages, favorites, reviews — across a
marketplace booking flow). Decisions below were confirmed with the project owner:
**domain sub-folders inside the existing layered packages** (not a module runtime),
**keep `awilix` DI** (reconcile `product-scope.md`'s "no DI container" line with it).

---

## 1. Final List of Engineering Rules

### Naming

| Element | Convention | Example |
|---|---|---|
| Package | `packages/<name>`, scoped `@devmentor/<name>` | `@devmentor/core` |
| Domain concept folder | plural, kebab/snake-free single word, matches the event namespace | `bookings`, `payments`, `mentors` |
| Entity | PascalCase singular class via `defineEntity`, file `<name>.entity.ts` inside its concept folder | `Booking` → `entities/bookings/booking.entity.ts` |
| DB table | snake_case, plural | `bookings` |
| DB column | snake_case (mapped from camelCase property) | `created_at` ← `createdAt` |
| Service | PascalCase class + `Service` suffix, file `<name>.service.ts` inside its concept folder | `BookingService` → `services/bookings/booking.service.ts` |
| Port (external integration interface) | PascalCase + `Gateway`/`Port` suffix, file `<name>.port.ts` | `PaymentGateway` → `services/payments/payment-gateway.port.ts` |
| Adapter (port implementation) | PascalCase + adapter name, under `adapters/` | `MockPaymentGateway` → `services/payments/adapters/mock-payment-gateway.ts` |
| DI cradle key | camelCase, one entry per dependency | `bookingService: BookingService` |
| Zod schema | camelCase variable + `Schema` suffix, file `<name>.schema.ts`, shared client/server | `bookingCreateSchema` → `validators/bookings/booking-create.schema.ts` |
| Event ID | `concept.entity.action`, past tense, dot-separated | `bookings.booking.created` |
| API route | one `route.ts` per resource under `api/<concept>/...` | `api/bookings/route.ts`, `api/bookings/[id]/reschedule/route.ts` |
| Page | `<segment>/page.tsx`, default export `<Segment>Page` | `sessions/page.tsx` → `SessionsPage` |
| UI component | PascalCase; shadcn primitives in `components/ui/`, concept-specific shared components in `components/<concept>/`, generic panel primitives in `backend/<category>/` | `MentorCard`, `CrudForm` |
| Domain error | PascalCase + `Error` suffix, extends `AppError`, file in `core/src/http/errors.ts` | `NotFoundError`, `ValidationError` |
| API route handler builder | `makeCrudRoute` (straightforward CRUD) or `apiHandler` (custom workflow), both from `core/src/http` | `export const { GET, POST } = makeCrudRoute({ ... })` |
| Client fetch helper | `apiCall`/`apiCallOrThrow` from `ui/src/backend/api`, never raw `fetch` | `const res = await apiCall<Booking[]>('/api/bookings')` |

### Reusable API & UI Layer (no duplicated fetch / validation / auth / CRUD code)

The single biggest risk of adding ~9 concepts one at a time is that every route and
every page re-invents fetch/validation/auth/error-handling slightly differently. Two
shared layers exist specifically to prevent that — **build a new one only when a
genuinely new pattern appears, never re-implement an existing one inline:**

**Server side — `packages/core/src/http/`:**

- `errors.ts` — a small typed error hierarchy (`AppError` base;
  `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ValidationError`,
  `ConflictError`). Services throw these; nothing else. A service never builds an
  HTTP response.
- `apiHandler.ts` — wraps a route function: catches thrown `AppError`s and maps them
  to the right status code and a consistent JSON envelope
  (`{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`),
  logs unexpected (non-`AppError`) failures via the shared logger, and never leaks a
  raw stack trace to the client. Every route handler is wrapped in this — no route
  writes its own `try/catch`.
- `makeCrudRoute.ts` — for a resource that is genuinely just list/create/update/delete
  (e.g. `favorites`, `technologies`), pass Zod schemas + service method references and
  get back `{ GET, POST, PUT, DELETE }` to re-export from `route.ts`. The route file
  becomes configuration, not logic. Workflow endpoints that don't fit CRUD (booking,
  reschedule, payment) use `apiHandler` directly and call one or more service methods
  inside — they don't force-fit `makeCrudRoute`.
- `auth.ts` — `requireSession(req)` (throws `UnauthorizedError`), `requireRole(session,
  role)` and ownership assertions (e.g. `assertOwnsBooking`) (throw `ForbiddenError`).
  Every route that isn't public calls one of these first, before touching a service.

**Client side — `packages/ui/src/backend/`:**

- `api/apiCall.ts` — the only place a `fetch()` call to `/api/*` is allowed. Parses
  the JSON envelope above defensively (`readJsonSafe`, never `.json().catch(...)`),
  returns a typed `ApiResult<T>`, and `apiCallOrThrow` for call sites that want to
  throw instead of branching on `ok`. No component calls `fetch` directly.
- `forms/CrudForm.tsx` — schema-driven form: takes the same Zod schema used server
  side, renders fields, shows server-returned `fieldErrors` next to the right field,
  handles submit/cancel/loading state, and standardizes `Cmd/Ctrl+Enter` to submit and
  `Escape` to cancel. Use it for every create/edit form; write a bespoke form only
  when the UX genuinely isn't a form-over-schema (e.g. the calendar slot picker).
- `tables/DataTable.tsx` — column-config-driven list rendering with built-in
  loading/empty/error states, pagination, and row actions. Use it for every list
  screen (search results, sessions, students, reviews) instead of hand-rolling a
  `<table>`/`.map()` per page.
- `feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx` — the only sanctioned
  loading/error/empty renderers; a page composes these instead of writing its own
  spinner/error text.

Note: the JSON envelope is a **shape convention**, not a shared TypeScript type —
`core/src/http` and `ui/src/backend/api` each declare their own `ApiResult`-shaped
type, because `ui` must not import `core` (see dependency direction below). If that
duplication ever becomes painful enough to matter, introduce a fifth
`packages/shared` package for it — that is an **Ask First** architecture change, not
something to add preemptively while there are only two consumers.

**Where a new reusable component goes** (so this stays a place things arrive at, not
a dumping ground):

1. A raw shadcn primitive (no app logic) → `ui/src/components/ui/`, added only via
   `npx shadcn@latest add <name>` — never hand-written.
2. A generic, concept-agnostic panel-building pattern used across concepts (a new
   kind of form field, a new table cell renderer, a new feedback state) →
   `ui/src/backend/<category>/`.
3. A component tied to one concept's domain shape (renders a `Booking`, a
   `MentorProfile`, a `Review`) → `ui/src/components/<concept>/`, named after the same
   concept folder used in `db`/`core` (e.g. `components/mentors/MentorCard.tsx`).
4. A component used by exactly one page → colocate it next to that `page.tsx`; only
   promote it into `components/<concept>/` the moment a second page needs it.

### Architecture

- Keep the enforced dependency direction `app → core → db`, `ui` importable by `app`
  only (ESLint `no-restricted-imports`). This boundary is doing real work and should
  not be loosened for convenience.
- A concept folder is created **only when its first entity/service is added** — do
  not pre-scaffold empty folders for concepts not yet implemented.
- External integrations (payment, and later notifications/video) are accessed through
  a **port interface in `core`**, with a mock/in-memory adapter for MVP and a real
  adapter (Stripe, etc.) added later without touching callers — this is required by
  UC04/UC06's "Stripe adapter" stretch goal and keeps `db`/`core` free of vendor SDKs.
- Domain events use a **lightweight typed emitter in `core/src/events`**, registered
  as a singleton in the `Cradle` — not a queue. Background workers/queues are
  explicitly out of scope for MVP; events are for in-process side effects (logging,
  triggering a message, cache invalidation) only.
- Shared Zod schemas live in `core/src/validators/<concept>/`, imported by both the
  API route (server validation) and the form component (client validation) — one
  schema, two call sites, never redefined.
- DB access stays confined to `export const dynamic = "force-dynamic"` routes/pages;
  the app must build and boot with no database reachable.
- Booking/payment flows that mutate shared state (slot availability) go through a DB
  transaction in the service layer — never split a check-then-write across two
  round-trips without a transaction.

### Engineering Principles (the ones that actually earn their keep here)

These are not abstract OOP trivia — each one maps to a real decision already made in
this codebase or in the structure proposed above. When two principles pull in
different directions, prefer the one that keeps the change **smaller and more
explicit**, not the one that looks more "enterprise."

- **SRP — one file, one reason to change.** An entity file owns schema/columns only;
  a service file owns one concept's business rules; a route file owns HTTP
  wiring only (validation → auth → service call → envelope). Example: `booking.service.ts`
  decides whether a slot is bookable; it never builds a `NextResponse`, and
  `api/bookings/route.ts` never contains a slot-availability check inline.
- **DRY — one definition, every call site imports it.** A Zod schema is written once
  in `core/src/validators/<concept>/` and imported by both the route handler and the
  `CrudForm`; the fetch/error-envelope logic is written once in `apiCall`/`apiHandler`,
  never re-typed per route or per page. If you're about to copy a `try/catch` or a
  validation block, stop and extract it instead.
- **Separation of Concerns — layers don't leak.** Persistence stays in `db`, business
  rules stay in `core`, HTTP/rendering stays in `app`, presentation stays in `ui`.
  `core` never imports `next`/`react` (already true and enforced by ESLint); a page
  component never issues a raw MikroORM query.
- **Dependency Inversion — depend on a port, not a vendor SDK.** `BookingService`
  depends on the `PaymentGateway` interface, not on the Stripe SDK. The MVP's
  `MockPaymentGateway` and a later `StripePaymentGateway` are interchangeable because
  callers only ever see the port. This is also why `db` is the only package allowed to
  import `@mikro-orm/*` — nothing else should be coupled to the specific ORM.
  `awilix` is the mechanism that wires the chosen adapter in at startup.
- **Explicit over implicit.** `container.ts` registers every dependency by hand — no
  `loadModules` globbing — specifically so every binding is greppable. Keep this
  discipline as services grow to ~9: a new service is a new explicit line in
  `container.ts` and `cradle.ts`, never auto-discovered from a folder scan.
- **Convention over configuration, scoped narrowly.** The `<concept>/` folder
  convention (Section 2) replaces what a module system would otherwise need a config
  file to declare. It only works because it's applied consistently — a concept that
  doesn't follow the folder convention breaks the convention for everyone reading the
  code afterward.
- **YAGNI — no speculative structure.** Don't create `messages/` before there's a
  `Message` entity to put in it; don't add a generic plugin/module loader because
  Open Mercato has one — this product's scope document explicitly excludes that. The
  four-package boundary plus concept folders is exactly as much structure as ~9
  concepts need, not more.
- **Composition over inheritance.** Prefer small functions/services composed together
  over class hierarchies. A `BookingService` composes a `SlotService` and a
  `PaymentGateway` port rather than a base `Service` class with template methods.
- **Fail closed, not open.** Any error inside an authorization or ownership check
  results in denial, never in falling through to "allow." A booking action with an
  ambiguous ownership result is a 403, not a best-effort 200.
- **Idempotency where retries can happen.** Payment confirmation and webhook-driven
  state transitions (UC04: "transitions booking to `confirmed` **exactly once**") must
  tolerate being invoked twice without double-charging or double-booking — this is
  the concrete reason the booking flow needs a DB transaction and a unique constraint
  on the slot, not just an application-level check.

### Security & Validation — Minimum Requirements

- **Password hashing:** `bcrypt`/`bcryptjs`, cost factor **≥ 12** (OWASP's floor is
  10; raise it since this is a small user base and the extra ~50ms per login is free).
  If a faster/stronger option becomes desirable later, the documented upgrade path is
  `argon2id` (memory ≥ 19 MiB, iterations ≥ 2, parallelism 1) — don't switch without a
  reason, but don't invent a third option either.
- **JWT:** signed with `HS256` minimum, using a secret ≥ 32 random bytes loaded from
  `env.ts` (zod-validated) — never hardcoded, never committed. Short expiry (e.g. 24h);
  there is no refresh-token flow in MVP scope — document that as a known limitation,
  don't silently extend the token lifetime to compensate.
- **Cookies:** `httpOnly`, `secure` in production, `sameSite=lax` (or `strict` for
  auth-only routes), scoped `path`. Never put the JWT in `localStorage` or a
  non-HttpOnly cookie.
- **CSRF:** because auth relies on a cookie, every state-changing route needs a CSRF
  defense — `sameSite` cookies plus a check that the request carries a custom header
  (`apiCall` always sets one; a plain HTML form post won't) is the minimum bar.
- **Rate limiting:** `login`, `register`, and any future password-reset endpoint need
  a brute-force control — a simple per-IP+email attempt counter with a cooldown is
  enough for MVP; note it explicitly as needing a stronger backend before real
  production traffic.
- **Ownership over role.** This product has no RBAC (explicitly out of scope), but
  every mutation still needs an ownership check: a student can only reschedule/cancel
  *their own* booking, a mentor can only edit *their own* profile/availability. Treat
  a missing ownership check exactly like a missing auth check — both are blockers.
- **Mass assignment:** a route never spreads the raw request body into `em.create()`;
  it always goes through the Zod schema's parsed, explicitly-typed output, so a client
  can't smuggle in fields like `id`, `status`, or `mentorId` on someone else's record.
- **Injection:** all persistence goes through MikroORM's entity/query APIs — no raw
  SQL string concatenation, no `Knex.raw` with interpolated user input.
- **Money correctness:** booking price is always recomputed server-side from
  `mentor.rate × duration`; a client-supplied price is parsed by the schema but never
  trusted or persisted as-is (UC04's own acceptance criterion).
- **Secrets & logging:** all secrets via env, validated by the zod env schema, `.env`
  git-ignored; `pino` never logs passwords, tokens, or full JWTs — redact those fields
  explicitly in the logger config.
- **Auth error messages:** generic on login/register ("invalid credentials"), never
  revealing whether a given email is registered.
- **IDs:** UUID (already the `base.entity.ts` default) — avoids sequential-ID
  enumeration of bookings/payments/messages across users.
- **Dependency hygiene:** run `npm audit` as part of the validation gate; don't add a
  dependency for something 20 lines of local code covers.

### Code Quality

- No `any`; narrow unknown types at runtime instead of disabling type-checking.
- Self-documenting code; a comment only for a non-obvious *why*.
- Three similar lines are fine; a copy-pasted block with branching logic is not —
  extract it (see DRY above).
- No feature you don't need yet (no RBAC, no multi-tenant, no queue) — the product
  scope explicitly excludes these; don't smuggle them back in "for later" (see YAGNI
  above).
- Every function does one thing at one level of abstraction; flatten deep nesting
  with early returns rather than nested `if`s.
- Error and empty/null paths are handled where they occur, not woven through the
  happy path — an early return beats a five-level-deep `if`.
- No empty `catch` blocks — handle, log with context via the shared logger, or
  rethrow; never swallow an error silently.
- No magic numbers/strings — name the constant and, where the value isn't obvious
  (a rate-limit window, a reschedule cutoff of 12 hours), say why that value.
- Booleans read positively at the call site (`isConfirmed`, not `!isNotConfirmed`);
  a bare `true`/`false` argument at a call site is replaced with a named option or a
  separate function.
- Dead code, commented-out code, and debug `console.log`s are removed before review,
  not left "just in case."
- A PR's diff traces entirely to its stated purpose — no drive-by renames, formatting
  passes, or speculative options mixed into a behavioral change.

### Code Review Checklist

#### Structure & conventions

- Concept folder naming matches the table above and the entity/service pairing exists
  on both sides (no entity without a service, no service without its entity).
- No import breaks the `app → core → db` direction or reaches into another concept's
  internals instead of its public service method.
- New routes use `makeCrudRoute`/`apiHandler` rather than a hand-rolled `try/catch`;
  new forms use `CrudForm`; new lists use `DataTable` — a bespoke implementation of
  any of these needs a stated reason in the PR description.
- `npm run lint`, `npm run typecheck`, and relevant tests pass before requesting
  review.

**Security fundamentals** (adapted from Open Mercato's shared review checklist —
kept to what actually applies to a project with no RBAC/multi-tenancy):

- [ ] Auth is enforced **server-side** on every route that isn't explicitly public —
  "the button is hidden in the UI" is not enforcement. (blocker)
- [ ] Authorization checks **the specific record**, not just "is logged in" — can this
  student cancel *this* booking, can this mentor edit *this* profile (no insecure
  direct object references). (blocker)
- [ ] Any check-then-act sequence on a shared resource — slot availability, booking
  status — is protected by a DB transaction and/or a unique constraint, not a
  read-then-write with a race window. (blocker for bookings/payments)
- [ ] No secret, token, password, or full JWT appears in a log line, error response,
  or client-visible payload. (blocker)
- [ ] No untrusted input reaches a query, shell command, or file path unparameterized
  or uncanonicalized. (blocker)
- [ ] A write endpoint parses an explicit Zod-typed shape — it never spreads the raw
  request body into `em.create()`/`em.assign()` (no mass assignment). (blocker)
- [ ] Cookie flags (`httpOnly`, `secure`, `sameSite`) are preserved whenever
  auth-cookie code is touched. (major)
- [ ] Error handling around a security decision fails **closed** (deny) on an
  unexpected error, never open (allow). (blocker)
- [ ] A bug fix for a security-relevant flow ships with a regression test that fails
  without the fix. (major)
- [ ] Rate limiting or another brute-force control is present on login/register/any
  password-reset endpoint touched by the change. (major)

#### Correctness & tests

- Race-condition-sensitive flows (booking, reschedule) are covered by an integration
  test that simulates the concurrent case, not just the happy path.
- Server-side revalidation exists for anything client-supplied that affects money or
  ownership (price, mentor ID, student ID).
- A behavior change ships with a test that fails on the pre-change code; a bug fix
  ships a regression test reproducing the original bug.

---

## 2. How to Place & Generate a New Example (for the agent)

When asked to scaffold a new domain concept (e.g., "add reviews"):

1. Create `packages/db/src/entities/<concept>/<name>.entity.ts`. Register it in
   `entities/index.ts`.
2. Create `packages/core/src/services/<concept>/<name>.service.ts`. Register the
   class in `container.ts` (`asClass(...).scoped()`) and its type in `cradle.ts`.
3. Add shared validation at `packages/core/src/validators/<concept>/<name>-<action>.schema.ts`
   — this is not optional once there's a create/update input to validate.
4. If the concept emits domain events, add them to `core/src/events` using the
   `concept.entity.action` naming and emit from the service after a successful
   mutation.
5. Add the HTTP surface in `packages/app/src/app/api/<concept>/route.ts`:
   - Plain CRUD resource → `export const { GET, POST, PUT, DELETE } = makeCrudRoute({ schema, service })`.
   - Custom workflow (booking, payment, reschedule) → wrap the handler in `apiHandler`,
     call `requireSession`/ownership assertions from `core/src/http/auth.ts`, then one
     or more service methods through `withScope`.
   - Never write a bare `try/catch` + manual `NextResponse.json` — that's what
     `apiHandler`/`makeCrudRoute` exist to remove.
6. Add the page(s) under the matching persona route group
   (`(student)/`, `(mentor)/`, `(auth)/`, `(marketing)/`):
   - Fetch through `apiCall`/`apiCallOrThrow` — never a raw `fetch`.
   - Create/edit UI → `CrudForm` bound to the same schema from step 3.
   - List UI → `DataTable`.
   - Loading/error/empty states → the shared `feedback/` components, not bespoke JSX.
   - Before writing any new component, check `ui/src/backend/` (generic pattern?) and
     `ui/src/components/<concept>/` (this concept already has it?) per the placement
     decision tree in Section 1 — only write a new one if neither applies.
7. Never create a `modules/<concept>/` directory, a per-concept `setup.ts`/`acl.ts`,
   or any auto-discovery mechanism — the four packages above are the only structure.

---

## 3. Changes to Apply to `AGENTS.md`

Add a new subsection right after **"Monorepo layout"**, and update **"Conventions &
gotchas"**:

```markdown
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
setup/ACL/auto-discovery. See `.ai/docs/engineering-standards.md` for the full
naming table and the payments-port/event-emitter patterns.

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

See `.ai/docs/engineering-standards.md` for the full rationale and the DRY/SRP/
dependency-inversion reasoning behind this split.
```

Also fix a doc inconsistency: `docs/product-scope.md` in the training-pack lists "DI
container" under **Explicitly not in scope**, but the bootstrap already uses
`awilix` throughout `@devmentor/core`. Update that scope doc to remove/qualify the
DI-container exclusion (the decision is to keep `awilix` — it already earns its keep
managing the scoped `EntityManager`, and will do more work once there are ~9 services
instead of 1) so the spec and the code stop contradicting each other.

---

## 4. Proposed Scalable Package Structure

```
packages/
  app/
    src/app/
      (marketing)/
        page.tsx                                  # S01 landing
        mentors/page.tsx                           # S02 search results
        mentors/[mentorId]/page.tsx                # S03 mentor profile
      (auth)/
        login/page.tsx                             # S04
        register/page.tsx
      (student)/
        book/[mentorId]/page.tsx                   # S05 booking flow
        checkout/[bookingId]/page.tsx               # S06 checkout
        dashboard/page.tsx                          # S07
        sessions/page.tsx                           # S08 my sessions
        sessions/[bookingId]/reschedule/page.tsx     # S09
        messages/page.tsx                           # S10
        favorites/page.tsx                          # S11
        settings/page.tsx                           # S12
      (mentor)/
        mentor/dashboard/page.tsx                   # M01
        mentor/availability/page.tsx                # M02
        mentor/sessions/page.tsx                    # M03
        mentor/profile/page.tsx                     # M04
        mentor/students/page.tsx                    # M05 (stretch)
        mentor/reviews/page.tsx                     # M06
      api/
        auth/route.ts
        mentors/route.ts
        mentors/[id]/route.ts
        availability/route.ts
        bookings/route.ts
        bookings/[id]/reschedule/route.ts
        bookings/[id]/cancel/route.ts
        payments/route.ts
        payments/webhook/route.ts
        messages/route.ts
        messages/[conversationId]/route.ts
        favorites/route.ts
        reviews/route.ts
        health/route.ts

  core/
    src/
      config/env.ts
      container/{container.ts,cradle.ts}
      logger.ts
      http/
        errors.ts                                   # AppError hierarchy
        apiHandler.ts                                # try/catch + envelope, once
        makeCrudRoute.ts                             # config-driven CRUD routes
        auth.ts                                      # requireSession/requireRole/ownership
      events/
        event-bus.ts                                # typed emitter, in-process only
        event-map.ts                                # `concept.entity.action` registry
      services/
        auth/user.service.ts
        mentors/mentor.service.ts
        mentors/technology.service.ts
        availability/availability.service.ts
        bookings/booking.service.ts
        payments/payment.service.ts
        payments/payment-gateway.port.ts             # interface
        payments/adapters/mock-payment-gateway.ts    # MVP adapter
        messages/message.service.ts
        favorites/favorite.service.ts
        reviews/review.service.ts
      validators/
        auth/register.schema.ts
        bookings/booking-create.schema.ts
        mentors/profile-update.schema.ts
        ...

  db/
    src/entities/
      base.entity.ts
      define.ts
      auth/user.entity.ts
      mentors/mentor-profile.entity.ts
      mentors/technology.entity.ts
      availability/slot.entity.ts
      bookings/booking.entity.ts
      payments/payment.entity.ts
      messages/conversation.entity.ts
      messages/message.entity.ts
      favorites/favorite.entity.ts
      reviews/review.entity.ts

  ui/
    src/
      components/
        ui/                                          # shadcn primitives only
                                                       # (npx shadcn add — never hand-written)
        mentors/
          mentor-card.tsx                             # concept-specific shared components,
        availability/                                 # one folder per concept, same names
          time-slot-picker.tsx                        # as entities/ and services/
        messages/
          conversation-thread.tsx
        reviews/
          review-stars.tsx
      backend/                                        # generic, concept-agnostic panel
        api/                                           # primitives — this is where NEW
          apiCall.ts                                   # cross-cutting UI patterns land
          types.ts                                     # (a new field type, a new table
        forms/                                         # cell renderer, a new feedback
          CrudForm.tsx                                  # state) as the app grows —
        tables/                                         # never a per-concept copy
          DataTable.tsx
        feedback/
          LoadingMessage.tsx
          ErrorMessage.tsx
          EmptyState.tsx
```

Dependency direction is unchanged: `app → core → db`, `ui` standalone. Only the
internal layout of `entities/`, `services/`, `validators/`, `api/`/pages, and
`ui/src/components/` gains a concept sub-folder — no new packages, no new
architectural boundary. `ui/src/backend/` is the one folder in this tree that is
*not* concept-scoped by design: it's the designated growth point for reusable
panel-building blocks shared across every concept, mirroring `core/src/http/` on the
server side.

---

## 5. Migration Instructions (current repo → this structure)

Do this incrementally, one buildable step at a time — never one giant move-everything
commit.

1. **Move the existing `auth` and `mentors` concepts into sub-folders first** (they
   already exist, nothing new to design):
   - `entities/user.entity.ts` → `entities/auth/user.entity.ts`
   - `entities/mentor-profile.entity.ts` → `entities/mentors/mentor-profile.entity.ts`
   - Update the relative imports inside those two files and in `entities/index.ts`.
   - `services/user.service.ts` → `services/auth/user.service.ts`
   - Update `services/index.ts`, `container.ts`, `cradle.ts` import paths.
   - Run `npm run typecheck && npm run lint && npm run build`. Table names, migration
     files, and the `Cradle` interface shape are unaffected — only file paths move.
2. **Add `packages/core/src/http/` (`errors.ts`, `apiHandler.ts`, `makeCrudRoute.ts`,
   `auth.ts`) and `packages/ui/src/backend/` (`api/apiCall.ts`, `forms/CrudForm.tsx`,
   `tables/DataTable.tsx`, `feedback/*`) next, before adding a second concept** — every
   concept from here on depends on these existing, and retrofitting them after three
   concepts already have hand-rolled fetch/error code is much more painful than
   building them first against one real example.
3. **Refactor `/admin/users` and `/api/health`-style demo code to prove the new
   layers work** before building on top of them: rewrite the existing
   `admin/users/page.tsx` (currently a hand-written `try/catch` + inline JSX list) to
   fetch through `apiCall` and render through `DataTable`, and give it a real
   `api/users/route.ts` built with `makeCrudRoute` instead of calling `withScope`
   directly from the page. This is the reference example every later concept copies —
   get it right once here.
4. **Add `core/src/events/` (event bus + event map)** before implementing the first
   feature that needs one (bookings or messages, per the use cases) — don't add it
   speculatively ahead of that.
5. **Add `core/src/validators/`** the same way, starting with whichever concept's
   spec you implement first (likely `auth/register.schema.ts` if auth forms come
   before booking).
6. **For every new concept from here on** (`availability`, `bookings`, `payments`,
   `messages`, `favorites`, `reviews`), follow Section 2 exactly — create folders only
   when adding that concept's first file, reuse `makeCrudRoute`/`apiHandler` and
   `CrudForm`/`DataTable` before writing anything bespoke, and never earlier.
7. **Update `AGENTS.md`** with the Section 3 diff in the same PR as step 1, so the
   convention (including the reusable API/UI layer) is documented before the second
   concept folder appears — not retroactively once the pattern is inconsistent across
   concepts.
8. **Reconcile `docs/product-scope.md`**: remove/qualify the "DI container" line
   under "Explicitly not in scope" per the decision to keep `awilix`.
9. After each step, confirm `npm run build` still succeeds and `/admin/users` /
   `/api/health` still work — they're the regression check for the whole migration
   until real features replace them.

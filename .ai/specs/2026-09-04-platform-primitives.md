# DevMentor — Platform Primitives

Date: 2026-09-04
Revised: 2026-09-08 — grilling review; see "What the 2026-09-08 revision changed" at the end
Status: active — moves to `implemented/` when its E01 `SHIP` entries land
Design authority: `.ai/specs/product-brief.md`, `.ai/specs/2026-09-01-engineering-standards.md`
First consumer: `.ai/specs/2026-09-04-accounts-and-roles.md` (issue #7)

## 📝 TLDR

The DevMentor backlog is 28 filed issues across five epics, and the same nine infrastructure
shapes recur in almost every one of them: a guarded state transition, an amount in cents, a
`(something, now)` comparison, a webhook that must apply exactly once, a list scoped to the
caller, a button that changes state after stating its consequence. This spec names each shape,
fixes its interface and its home in the four-package layout, and — critically — says **which
ones ship now and which wait for the story that first needs them**. It is the companion to the
E01 spec: E01 is the feature, this is the floor everything after it stands on.

Nothing here is a new architectural boundary. Every primitive lands inside the existing
`app → core → db` / `ui` structure, in `core/src/http/`, `core/src/services/<concept>/`, or
`ui/src/backend/` — the folders the engineering-standards spec already designates as the
growth points for cross-cutting code.

## 📝 Lifecycle

This document follows the normal lifecycle in `AGENTS.md`. Its implemented scope is only the
entries marked `SHIP`, delivered by E01. Once those entries are implemented and verified, this
file moves to `.ai/specs/implemented/` and becomes immutable.

Entries marked `DEFER` are non-binding design notes, not fixed interfaces or work owned by this
spec. Each is re-designed by the future capability spec using its real requirements; that spec
becomes the sole authority and does not amend this implemented document. This preserves useful
context without creating a permanently mutable design authority.

## 📝 Problem Statement

**The evidence that this is needed is the backlog itself.** A survey of issues #12–#34 found
the same infrastructure described independently in issue after issue, each time as if it were
local to that story:

| Shape | Issues that independently describe it |
|---|---|
| Guarded status transition | #21, #22, #24, #25, #28, #29, #30, #32 |
| `now` threaded into a service method | #20, #21, #22, #24, #25, #26, #30, #32 |
| Amount in integer cents, recomputed server-side | #18, #20, #21, #22, #24, #25, #31 |
| "X sees only their own Y" | #23, #26, #27, #28, #29, #32 |
| Exactly-once application of an external event | #22, #24, #33, #34 |
| Notify both parties of a booking | #22, #23, #24, #27, #28, #29, #32 |
| Check-then-act under a transaction + unique constraint | #21, #22, #24, #25, #28, #30, #32 |
| A button that transitions state after confirming | #22, #24, #25, #28, #29, #30, #32 |
| Env-seeded value that later moves to a DB row | #18 → #31, #25 |

The engineering-standards spec already predicted the failure mode this creates: *"The single
biggest risk of adding ~9 concepts one at a time is that every route and every page re-invents
fetch/validation/auth/error-handling slightly differently."* That risk was headed off for HTTP
and forms by `core/src/http/` and `ui/src/backend/`. It has **not** been headed off for the
nine shapes above, and the backlog shows nine to fourteen separate places each one would
otherwise be re-derived.

The cost is not only duplication. Three of these shapes are security- or money-critical, and
each backlog issue restates their rules in slightly different words:

- `#23`: *"never a `userId` parameter from the client"* — stated once, needed on every list.
- `#25`: fee snapshot *"so a later fee change never touches earlier bookings"* — stated once,
  needed wherever money is recorded.
- `#22`: *"insert the event id first (a duplicate is a no-op)"* — stated once, needed by three
  webhook branches across #22, #24 and #33.

A rule restated per-story is a rule that will eventually be restated wrong.

## 📝 Proposed Solution

**Design every primitive now; build only the ones E01 genuinely consumes.**

`AGENTS.md` is explicit that speculative structure is a defect (*"Don't create `messages/`
before there's a `Message` entity to put in it"*), and the standards spec lists YAGNI among the
principles that *"actually earn their keep here"*. A framework built ahead of its consumers
would violate the repository's own law and would ship abstractions no real caller has pushed
against.

So this document is deliberately two things:

1. **A delivery catalogue** — E01 primitives have an interface, home, rationale, and real caller.
   Deferred entries record only constraints and evidence; their sample shapes are not contracts.
2. **A ship gate** — each entry is `SHIP` or `DEFER #n` with the issue that unblocks it. A
   deferred primitive is a paragraph in this file, not an empty folder in the tree.

**The gate.** An entry is `SHIP` when E01's delivered code — production code *or* the
integration harness — contains a real call site for it. A test helper with a real test consumer
passes (F7); a production helper whose only consumer is its own unit test does not. The rule
this defends is *no empty folders and no callerless abstractions*, not "no test code".

The gate is deliberately strict about what counts as a consumer. An earlier draft of this spec
marked `scopedList`, `requireAnyRole` and the opaque-token helpers as `SHIP`; review found that
each would land with tests and **zero callers** in E01 — precisely the artefact this spec argues
against. They are deferred below, and `requireAnyRole` is dropped entirely because no issue in
the backlog actually needs it (every "more than one role may do this" case in the backlog is a
*party* check, not a role check).

### Alternatives considered

- **Build the whole layer up front.** Rejected: contradicts `AGENTS.md`, and at least three
  primitives are still underdetermined — e.g. `Booking` carries *two orthogonal status fields*
  (`status` and `refundStatus`, #21 + #24), which an entity-scoped transition helper would get
  wrong.
- **Design nothing; let each story invent what it needs.** Rejected: that is the status quo the
  evidence above indicts.
- **Introduce a fifth `packages/shared`.** Rejected. The standards spec names this an
  "Ask First" change and reserves it for the envelope-type duplication. Everything here fits in
  `core` or `ui`.

## 📝 Architecture

No new package, no new boundary. Two new cross-cutting folders in `core`, two in
`ui/src/backend/`, one in `app/src`:

```
packages/core/src/
  http/            errors.ts  apiHandler.ts  makeCrudRoute.ts  auth.ts        (exists)
                 + rate-limit.ts  return-to.ts  outbound.ts
  time/          + clock.ts                                     (new; siblings of http/, not a concept)
  persistence/   + transaction.ts                               (DEFER #22; NOT named `db/` — see below)
  services/<concept>/…                                          (concept-scoped, unchanged)
  services/<concept>/<name>.port.ts + adapters/                 (ports, per the standards naming table)

packages/db/src/entities/auth/
               + rate-limit.entity.ts                           (B8's counter table)

packages/ui/src/backend/
  api/  forms/  tables/  feedback/                              (exists)
+ shell/         AppShell.tsx
+ actions/       WorkflowAction.tsx

packages/app/src/
+ lib/           session.ts                                     (next/headers lives here, not core)
```

`core/src/money/`, `core/src/domain/`, `core/src/persistence/` and the webhook module are named
in the catalogue but **are not created until their trigger issue**. Creating a folder to hold
one deferred file is the speculative structure this spec exists to avoid.

The helper is `core/src/persistence/transaction.ts`, not `core/src/db/transaction.ts`: a folder
named `db` inside `core` would sit one import line away from `@devmentor/db` and read as the
same thing to anyone scanning the file.

Two placement rules this establishes:

- **`core` never imports `next` or `react`.** Anything needing `next/headers`, `redirect`, or the
  App Router lives in `packages/app/src/lib/`. `core/src/http/auth.ts` stays framework-free.
- **`ui` never imports `core` or `next`.** No UI primitive may reference `Role`, `Session`, or an
  `AppError`. `packages/ui/package.json` has **no `next` dependency** (React is a peer dep only),
  so `AppShell` cannot render `next/link` — it takes the rendered navigation as a `ReactNode`
  slot and the caller in `app` supplies the links.

**Enforcement, honestly stated.** `eslint.config.mjs` today restricts only the `@devmentor/*`
workspace names, so `ui ↛ core` is lint-enforced but `core ↛ next` and `ui ↛ next` are held by
nothing except the manifests. The PR that ships F3 adds the third-party patterns: `next`,
`next/*` and `react` forbidden in `packages/core/**` and `packages/db/**`; `next` and `next/*`
forbidden in `packages/ui/**`. Until that lands, the second rule above is a convention.

And one rule from a failure mode review caught in the first draft:

- **A route a browser *navigates to* redirects; a route a browser *fetches* envelopes.**
  `apiHandler` answers every `AppError` with `content-type: application/json`, which is correct
  for `apiCall` and wrong for a `<a href="/api/auth/github">`. Browser-navigated `GET` routes
  catch their own failures and redirect to a page that can explain them.

---

## 📝 The catalogue

`SHIP` = E01 has a real call site and this spec owns the contract. `DEFER #n` = a non-binding
note for the issue that first needs it; do not create the file or treat the sketched shape as
settled before then. 28 entries: 17 `SHIP`, 11 `DEFER`.

### Backend

#### B1 · Clock — `core/src/time/clock.ts` · **SHIP**

```ts
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() }
```
Registered on the `Cradle` as `clock: asValue(systemClock)`; tests inject a fixed clock.

**How it enters.** The clock is infrastructure, not a domain input, so the auth services (B2,
B5, B8) are classes that take `{ clock }` from the `Cradle` in their constructor and read it
internally — `jose` receives it as `currentDate` on verify, and the rate limiter uses it for
window arithmetic. Their public methods do **not** take a `now` parameter. The explicit
`now: Date` parameter style is reserved for *domain* methods where the caller's instant is the
business input — `expirePending(now)`, `runDue(now)`, `window(booking, now)` — which arrive with
their own issues.

**Why a primitive and not a parameter.** Every service signature named in the backlog *already*
threads `now`: `expirePending(now)`, `runDue(now)`, `window(booking, now)`, `report(batchId,
now)`, `cancelByMentee(session, id, now)`, `listPublished(tag?, now)`. The issues demand
boundary tests at *exactly* 24 hours (#24), the two-week mark (#30), and the session window
edges (#26). Formalising the clock costs one line and makes those tests deterministic instead
of sleep-based.

**Timezone rule, decided here because every deferred time rule needs it.** All instants are
stored `timestamptz` and reasoned about in UTC; `Clock.now()` returns a UTC-based `Date` and no
service ever constructs a local-time date. Wall-clock presentation — a slot at "14:00" — is the
*browser's* job, in the viewer's own zone. The mentor publishes an instant, not a local time.
This matters because slot publication (#17), the two-hour lead (#21), the 24-hour cancellation
window (#24) and the two-week publish window (#30) each involve two parties who may be in
different zones, and none of those issues says whose clock governs. It is UTC, and the answer
is here rather than re-derived four times.

E01's consumers: session expiry, verification-token expiry, rate-limit windows.

#### B2 · Session & identity — `core/src/services/auth/session.service.ts` · **SHIP**

```ts
issue(user: { id: string; sessionVersion: number }): { cookie: string; expiresAt: Date }
verify(cookieValue: string): SessionClaims | null    // stateless: signature + audience + expiry; no roles
clear(): string                                       // the expiring Set-Cookie value
```

Token format is a plain JWT produced and verified by `jose`, restricted explicitly to HS256,
using `SESSION_SECRET` (≥ 32 bytes from `env.ts`). Payload `{ sub, sv, aud: 'session', iat,
exp }`, 24 h, no refresh flow. Roles are deliberately absent: authorization always loads the
current stored set. There is no format-version prefix around the JWT; if the format ever needs
versioning, that is a claim, not a wrapper.

**Audience separation.** Every token this codebase signs carries an `aud`, and every verifier
names the one audience it accepts. The session token is `aud: 'session'`; purpose tokens (B5)
carry their purpose. This is what guarantees a verification link can never be presented as a
session cookie, or a session cookie as a verification link — by design, not because one
happens to lack a claim the other checks.

**Why a library is warranted.** Authentication token parsing and verification are security-
critical protocol work, not ordinary "20 lines of local code." `jose` supplies the standard
format and validation behavior; verification fixes the accepted algorithm to HS256 so the JWT
header cannot select a weaker algorithm. `jose` is the **only** runtime dependency this spec
adds; see B9 and B14 for why hashing and mail add none.

**Revocation — `sv` (session version).** A purely stateless token cannot be revoked: a copied
cookie stays valid for its full 24 hours regardless of sign-out, an operator demotion would take
up to a day to bite, and a changed password would not invalidate anything. `SDLC.md` classes
authentication and login sessions as `risk-high`, gated on a denied-path integration test and a
second reviewer, so the design carries a `session_version` integer on `users`, mirrored as `sv`
in the payload. Bumping the column invalidates every outstanding session for that user
immediately, and covers sign-out-everywhere, demotion, and password change with one column.

The cost is one indexed primary-key lookup per guard — see B3 for where it is paid and the
accepted multiplicity. `verify()` itself stays pure and DB-free; changing the current stubbed
`requireSession(req)` signature is a documented §2 breaking change made while there are no
production consumers.

**Key rotation.** `SESSION_SECRET_PREVIOUS` (optional) is accepted on *verify* only, never on
issue. Rotating is then: set the new secret, move the old one to `_PREVIOUS`, deploy; existing
sessions keep working for their remaining lifetime, and dropping `_PREVIOUS` a day later
completes the rotation. Without this, rotating a leaked secret signs every user out at once.

**Cookie serialisation.** `core` cannot use Next's cookie helpers, so `issue()` and `clear()`
build the raw `Set-Cookie` string themselves — five flags, one hand-rolled function with a unit
test. This is the "20 lines of local code" case; no `cookie` package. Flags: `httpOnly`,
`secure` in production, `sameSite=lax`, `path=/`, name `devmentor_session` (§7 surface — kept).
The `__Host-` prefix, which would let the browser enforce `Secure` + `path=/` + no `Domain`,
was weighed and rejected for now: it forbids `Secure`-less cookies entirely, and `npm run dev`
serves plain HTTP on localhost. Revisit if a staging environment on a real hostname appears.

#### B3 · Authorization — `core/src/http/auth.ts` (extended) · **SHIP (partly)**

| Export | Status | Evidence |
|---|---|---|
| `requireSession(req)` | exists | — |
| `requireRole(session, role)` | exists | #21, #25, #30, #31, #32 |
| `assertOwnership(session, ownerId)` | exists | #22, #24, #27 |
| `requireSession(req, cradle)` | **SHIP (breaking replacement)** | canonical route path: verify JWT, check `sv`, return stored roles |
| `requireCsrfHeader(req)` | **SHIP** | #14, #21, #24, #29, #31; `apiCall` already sends `x-devmentor-request`, nothing checks it |
| `assertParty(session, party: { userIds: string[] })` | DEFER #26 | #26: the check is two-sided — the mentee's id **or** the mentor's user id |
| `operatorReadException(session, reason: string)` | DEFER #32 | #32 calls the operator reading session text *"a scoping exception that must be explicit"*; #29 needs the same |
| ~~`requireAnyRole`~~ | **dropped** | No issue needs it. Every "either of two roles" case in the backlog (#26, #27, #32) is a *party* check, which `assertParty` covers |

`requireSession` is the only authorization entry point and makes `sv` real:

```ts
requireSession(req: Request, cradle: Cradle): Promise<Session>
// one findOne(User, { id: claims.sub }) → 401 if absent,
// 401 if user.sessionVersion !== claims.sv, and returns { userId, roles: user.roles }
```

It runs inside a request scope, so it has an `em`. Every protected route and layout guard uses
this live path. A cookie-only parser may exist internally for diagnostics, but it is not exported
as an authorization API. Stored roles always win; the token contains no role copy.

**`Session.roles` is a non-empty tuple**, `readonly [Role, ...Role[]]`, because E01 constrains
`users.roles` non-empty at the column and `homeFor` (F3) must not have an undefined case. A
stored row that nonetheless has an empty array is corrupt: `requireSession` throws an internal
error (logged, 500), never a 401 — a 401 would bounce the user into a sign-in loop and hide a
data bug.

**Lookup cost, accepted.** Within one request scope the session resolves once (E01 registers it
as a scoped, lazily-resolved cradle key). Across a page render, the root layout guard, a nested
layout guard and the page's own data fetch each open their own scope, so a signed-in page may
perform two or three identical user lookups, and every `apiCall` from that page adds one more.
This is accepted for E01 and recorded as a known cost. Memoising with React `cache()` is a
five-line change later; caching an authorization check prematurely is how stale-role bugs
start.

**CSRF is enforced once, in `apiHandler`.** `requireCsrfHeader(req)` exists as a named,
testable export, but no route calls it: `apiHandler` invokes it for every method other than
`GET`, `HEAD` and `OPTIONS`. `apiHandler` gains an options argument, `apiHandler(logic, { csrf:
false })`, whose only permitted consumer is the webhook route (B13), which authenticates by
signature instead. A forgotten CSRF check is exactly the "rule restated per story until restated
wrong" failure this spec exists to prevent, so the check is unforgettable by construction. Two
consequences: every state-changing `/api/*` route is JSON-only and is called through `apiCall`
or `CrudForm`, never a native HTML form; and `makeCrudRoute`'s `POST`/`PUT`/`DELETE` inherit the
check for free.

**Cradle registrations E01 adds**, with lifetimes, so the container diff is reviewable against
the spec:

| Key | Lifetime | Why |
|---|---|---|
| `clock` | value | B1 |
| `sessionService`, `tokenService`, `passwordService` | singleton | stateless: secret + clock |
| `githubIdentity`, `mailer` | singleton | stateless adapters |
| `rateLimiter` | scoped | needs the scoped `em` |
| `session` | scoped, lazy | E01's request-scoped `Session \| null` |

`operatorReadException` deserves a note: it does nothing `requireRole(session, 'operator')`
does not, except be **greppable and separately testable**. Two paths in the backlog let the
operator read data the party-scoping rules otherwise forbid. A named marker means an auditor
finds every such path with one search, and a test can assert the set has not grown.

#### B4 · Scoped list authorization — concept-owned methods · **DEFER #23**

The most repeated authorization requirement in the backlog is *"X sees only their own Y"* (#23,
#26, #27, #28, #29, #32), and #23 states the rule that makes it safe: the scope comes from the
session, **"never a `userId` parameter from the client"**.

There is deliberately no role-dispatch helper. A user may hold multiple roles, so selecting one
handler from a single role would be ambiguous and would conflate authorization with product
context. The route for a mentee surface explicitly requires `mentee` and calls
`listForMentee(session.userId)`; the mentor surface explicitly requires `mentor` and calls
`listForMentor(session.userId)`. Missing membership throws `ForbiddenError` before the service
call. The service never accepts an owner id supplied by the request body or query.

**Why it is deferred despite E01 touching a list.** `/api/users` has one operator-only meaning,
so its existing `makeCrudRoute.authorize(req, cradle)` hook can call the canonical live
`requireSession(req, cradle)` and then `requireRole(session, 'operator')`. #23 is the first
consumer needing two differently scoped list operations and owns their explicit route design.

No `makeCrudRoute` contract change is required for E01.

#### B5 · Purpose-bound tokens — `core/src/services/auth/token.service.ts` · **SHIP (partly)**

```ts
// Stateless, nothing stored. OAuth `state`, email verification.          SHIP
signPurposeToken({ purpose, subject, ttlSeconds }): string
verifyPurposeToken(token: string, purpose: string): { subject: string }   // throws on bad/expired

// Stored — a hash in the database, so it can be single-use and revocable. DEFER #15
mintOpaqueToken(): { token: string; tokenHash: string }
hashToken(token: string): string
```

**Format.** The same `jose` HS256 machinery as B2, the same `SESSION_SECRET` family, with the
purpose carried as `aud` and enforced on verify, `sub` as the subject, and `exp` from
`ttlSeconds`. `SESSION_SECRET_PREVIOUS` is honoured on verify here too, so a rotation mid-flight
does not break every in-flight verification email. Separate secrets were considered and
rejected: both are HS256 at the same trust level, and one secret means one rotation procedure.

Purpose-binding is the point: a verification token must not be replayable as an invitation
token, and audience separation (B2) is what makes that structural. E01 uses the stateless pair
for the OAuth `state` (#12) and email verification (#13). The opaque pair is deferred to #15,
its first real consumer — invitation links with `tokenHash` unique and *"constant-time hash
compare"*.

**A purpose token never authenticates the bearer.** It proves *we issued this claim*, not
*this browser is the one we issued it to*. Any flow that needs bearer binding must pair the
token with a separate check — for OAuth `state`, the callback compares the `?state` query value
with the `devmentor_oauth_state` cookie for equality before verifying either, which is what
stops login CSRF (an attacker completing a flow and handing the victim the callback URL). Email
verification is bearer-authenticated by construction and that is acceptable there; it is not
acceptable for `state`.

**Correction to the first draft:** it listed the mentor share link (#16) as an opaque-token
consumer. It is not — a share link is a public, re-visitable URL, i.e. a **slug**, not a
single-use secret. See B21.

#### B6 · Fail-closed config gate — `core/src/http/errors.ts` + `config/env.ts` · **SHIP**

Add two members to the `AppError` family, both additive under §1:

- `ServiceUnavailableError` — 503, code `service_unavailable`.
- `TooManyRequestsError` — 429, code `rate_limited`, carrying `retryAfterSeconds` in the
  envelope and a `Retry-After` header on the response.

The header needs one small extension: `AppError` gains an optional `headers` field that
`apiHandler` copies onto the response. Additive; no existing error sets it.

The rule the 503 enforces has three tiers, refined from the first draft's single sentence:

> **Integration credentials** (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `MAIL_API_KEY`) are
> `optional()` in the zod env schema and checked **at the route**, not at boot. A missing
> `GITHUB_CLIENT_SECRET` makes `/api/auth/github` fail closed; it never prevents the app from
> building or booting.
>
> **`SESSION_SECRET` in production is required at first container creation.** A production
> deploy without the one secret the whole auth slice depends on must not boot green and 503
> every sign-in until someone notices. The check lives in `createContainer`, **not** in the zod
> schema, because `npm run build` runs with `NODE_ENV=production` and no secrets in CI, and
> `getEnv()` is reachable from a page at build time; the container is only ever created at
> request time. The same check requires `MAIL_API_KEY` in production unless `MAILER_ADAPTER=log`
> is legitimately set (B14). Development and the build are unaffected.
>
> **Dangerous configuration fails at boot**, in the schema, loudly (E01's amendment): a test
> adapter selected without the integration-run signal is refused at parse time, never silently
> replaced by the real adapter. See B14.

This extends `AGENTS.md`'s existing "the app must build and boot with no database reachable"
discipline to every integration. #12 asks for it by name; #22 and #34 restate it for Stripe
(*"optional with fail-closed routes"*). Per the navigated-vs-fetched rule above, a
browser-navigated route renders the 503 as a redirect to a page that explains it, not as a JSON
envelope.

#### B7 · Safe return-to — `core/src/http/return-to.ts` · **SHIP**

```ts
safeReturnTo(value: string | null | undefined, fallback: string): string
```
Accepts only a same-origin **relative page path**: begins with a single `/`, not `//host`, not
`/\host`, no scheme, and **not under `/api/` or `/_next/`**. Anything else yields the fallback.
Open-redirect defence, plus the one gap a pure path validator leaves: a validated
`returnTo=/api/auth/github` would send a freshly signed-in browser back into the OAuth start
route, and `returnTo=/api/users` would render a JSON envelope as a page — the exact thing the
navigated-vs-fetched rule forbids.

Three flows round-trip through sign-in and must come back where they started: the invitation
link (#15, `/sign-in?returnTo=/invitation/<token>`), the email-password fallback (#13), and the
slot picker (#21, *"back to the same slot after sign-in"*). One validator, three call sites.

#### B8 · Rate limiting — `core/src/http/rate-limit.ts` + `AuthRateLimit` entity · **SHIP**

```ts
class RateLimiter {                                   // scoped: { em, clock }
  consume(key: string, policy: RateLimitPolicy): Promise<void>   // throws TooManyRequestsError
}
type RateLimitPolicy = { limit: number; windowMs: number }
```

PostgreSQL-backed fixed-window counters, per-IP **and** per-email keys, driven by the injected
`Clock` (B1). The operation is atomic and shared by every app instance. This avoids presenting a
process-local `Map` as production brute-force protection and avoids adding Redis solely for E01.
There is no "cooldown" beyond the window itself; the two policies below are the whole behaviour.

**The table, owned here.** `packages/db/src/entities/auth/rate-limit.entity.ts` →
`auth_rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, count int NOT
NULL)`, indexed on `window_start`, with a migration (up **and** down) delivered in E01 Slice 4.
This is the **one stated exception** to the Data Model rule that every entity spreads
`baseProperties`: a counter keyed by a natural text key has no use for a uuid id or timestamps,
and carrying them would be dead weight on a hot path.

**Keys hold no PII.** The key is `<scope>:<kind>:<sha256hex>` where the hashed part is the
lower-cased email or the client IP — e.g. `sign-in:email:…`, `sign-in:ip:…`. Lower-casing
before hashing keeps `A@x` and `a@x` in one bucket.

**One raw-SQL upsert.** MikroORM's entity API cannot express `INSERT … ON CONFLICT (key) DO
UPDATE SET count = CASE WHEN window_start < $now - $window THEN 1 ELSE count + 1 END,
window_start = CASE … END RETURNING count`, so the service issues it through `em.execute` and
is tested against the real container. **Expired windows are deleted on every call**: a single
`DELETE … WHERE window_start < $now - $longestWindow`, indexed, in the same statement batch. At
this scale that is one cheap delete; a probabilistic gate is complexity for a problem the
project does not have.

**Which IP.** A Next route handler's `Request` has no socket address; the IP comes from
`x-forwarded-for`. Trusting it blindly makes the limit bypassable by setting the header;
ignoring it puts every user behind a proxy in one bucket. `TRUSTED_PROXY_HOPS` (integer, default
`0`) joins the env schema and the limiter takes the Nth-from-right entry. With `0` hops and no
derivable address the per-IP key is skipped, the per-email key still applies, and a warning is
logged once per process. Whether Next's own server populates the header from the socket when no
proxy is present is verified during implementation, not assumed.

**Every attempt counts, before any credential work.** The counter is consumed first and never
decremented, so a legitimate user is blocked only after the policy's worth of sign-ins in one
window, and the limiter never leaks timing about whether a password was checked. The one
ordering rule E01's hashing gate needs: acquire the gate slot **first** (a cheap in-memory
check), consume the limit second, hash third — so a gate-saturation 503 has not touched the
counter, which is what E01's edge case 18 promises.

**Policies, as named constants in `rate-limit.ts`** — no document stated them before this
revision:

| Action | Per IP | Per email |
|---|---|---|
| sign-in | 10 / 15 min | 5 / 15 min |
| registration | 5 / hour | — |
| verification resend | — | 3 / hour |

Conservative and easy to loosen. On exceed the route answers `429 rate_limited` with a generic
message that does not reveal whether the email exists.

#### B9 · Password hashing — `core/src/services/auth/password.service.ts` · **SHIP**

`node:crypto`'s `scrypt` at the parameters the E01 spec fixes (N=2¹⁷, r=8, p=1, `maxmem`
raised explicitly) behind E01's global concurrency gate. **No dependency is added.** The first
draft specified `bcryptjs` cost 12; E01's review found that `bcryptjs` is pure JavaScript
chunked through `setImmediate` on the main thread — cost 12 stalls the whole Next server for
about a second per attempt — and the standards spec's "~50 ms" figure describes the native
binding. E01 is the authority on hashing and this entry follows it. The `argon2id` upgrade path
named by the standards spec is unaffected.

#### B10 · Transaction discipline — concept-owned in E01 · **SHIP (no shared helper)**

Eight check-then-act sites are named in the backlog (#21 slot booking, #22 webhook confirm, #24
cancel, #25 payout, #28 note version, #30 batch cap, #32 one-open-dispute), and #21 quotes the
house rule verbatim: *"never split a check-then-write across two round-trips without a
transaction"*.

**E01 has one:** `findOrCreateFromGithub` looks up by `githubId`, then by verified email, then
creates inside `UserService`. Two concurrent callbacks may race into the unique constraints on
`users.email` or `users.github_id`; the service handles only those named constraints, re-runs the
corresponding lookup, and proceeds with the winner — subject to E01's linking rule that a
re-read row is linked only when its own `email_verified_at` is set. Other unique violations are
rethrown rather than hidden as business conflicts. A shared helper is extracted only after a
second domain use proves identical recovery semantics.

`afterCommit(fn)` — for #24's *"after commit, `paymentGateway.refund(...)`"* and post-commit
event emission — is **DEFER #22**. E01 has no external call to sequence after a commit.

#### B11 · Guarded state transition — `core/src/domain/transition.ts` · **DEFER #21**

```ts
defineTransitions<S extends string>(map: Record<S, readonly S[]>): TransitionTable<S>
applyTransition<E, S>(entity: E, field: keyof E, to: S, table: TransitionTable<S>): void
applyIdempotent<E, S>(entity: E, field: keyof E, to: S, table): 'applied' | 'noop'
```

Five stored machines are already fully specified in the backlog:

| Entity | Field | States | Issues |
|---|---|---|---|
| Booking | `status` | `pending → confirmed \| expired`, `confirmed → cancelled` | #21, #22, #24 |
| Booking | `refundStatus` | `none → pending → refunded \| failed` | #24 |
| Payout | `status` | `held \| transferred \| failed` (retryable) | #25 |
| SessionNote | `status` | `draft → awaiting_approval → approved \| declined`, versioned | #28, #29 |
| Dispute | `status` | `open → resolved` + outcome enum | #32 |

Two constraints recorded now so the eventual implementation does not get them wrong:

1. **Field-scoped, not entity-scoped.** `Booking` carries two orthogonal status fields; a helper
   keyed on the entity would conflate them.
2. **An idempotent variant is mandatory, not a convenience.** #24's refund transition is driven
   by *both* a synchronous gateway call and an async `charge.refunded` webhook. Whichever
   arrives second must be a no-op, not a `ConflictError`.

E01 has no entity with a status field, so nothing is built here yet.

#### B12 · Money — `core/src/money/money.ts` · **DEFER #18**

```ts
type Cents = number  // integer minor units; the codebase has no other money representation
splitFee(amountCents: Cents, feePercent: number): { platformFeeCents: Cents; mentorShareCents: Cents }
withinBounds(amountCents: Cents, min: Cents, max: Cents): boolean
```

The split assigns the rounding remainder to the mentor (`mentorShareCents = amountCents -
platformFeeCents`, #25) — the platform absorbs the rounding, and #25 makes rounding an explicit
test target. Two rules travel with this primitive, restated in five issues and fixed here:

- **Never trust a client amount.** #21: *"The client never supplies a price."* #22 verifies
  `amount_total === booking.priceCents` and refuses on mismatch.
- **Snapshot at the transition.** #25: `feePercentApplied` is written at confirmation *"so a
  later fee change never touches earlier bookings"*.

#### B13 · Webhook inbox — `core/src/http/webhook.ts` + `ProcessedWebhookEvent` · **DEFER #22**

A raw-body route wrapper (signature verification needs the unparsed body) plus
insert-event-id-first dispatch inside a transaction, so a redelivery is a no-op. Three branches
across #22 (`checkout.session.completed`), #24 (`charge.refunded`) and #33 (`account.updated`)
share it.

**This primitive carries a compatibility amendment.** #22 states that the webhook route must
answer Stripe with *"a plain 2xx/4xx rather than the envelope"* — the one documented exception
to §1. Whoever builds it writes that exception into §1 in the same PR. It is also the only
permitted consumer of `apiHandler`'s `{ csrf: false }` (B3): Stripe cannot send the custom
header, and the signature check is the stronger authentication.

#### B14 · Ports & adapters · **SHIP (two of three)**

The pattern has **no instance in the codebase today** — a survey for `*.port.ts` / `adapters/`
returns nothing. E01 establishes it with the two ports it actually needs.

**Selecting a fake adapter — one rule for every fake.** The integration harness builds and runs
the app as a child process, so it cannot compose the container in-process; selection
necessarily crosses the boundary as configuration, and the production container is the only
container. This spec states that honestly rather than calling it "composition": a fake is
selected by an **explicit env pair** — the adapter switch *and* `INTEGRATION_TEST_RUN=1` — and
the zod schema **refuses to parse, failing at boot,** when the switch is set without the run
signal. Selection is from flags that are *present*, never from credentials that are *absent*;
the harness sets both in `tests/integration/environment.ts`, and `NODE_ENV=production` there
does not weaken this because `NODE_ENV` plays no part in the rule.

**GitHub identity — SHIP.**
```
core/src/services/auth/github-identity.port.ts               authorizeUrl({ state, login? }) / exchangeCode / fetchIdentity
core/src/services/auth/adapters/github-identity.ts           two fetchJson calls, no SDK
core/src/services/auth/adapters/mock-github-identity.ts      AUTH_IDENTITY_ADAPTER=mock + INTEGRATION_TEST_RUN=1
```

The mock adapter is not a convenience — it is the *only* way E01's headline acceptance criteria
("lands on the mentee home", "a mentor's sign-in lands on the mentor home", the operator
sign-in in `admin.integration.test.ts`) can be exercised without calling GitHub from CI. The
alternative an earlier draft assumed — an env-keyed "test mode" branch inside the callback route
that mints a session for an arbitrary identity — is an authentication bypass living in
production code. Behind a port, the fake is a whole adapter selected by the rule above, and the
route code has no test branch at all.

**Personas come from a `login` hint, not from a fixed identity.** The first draft said "a fixed
identity". That cannot serve E01: `operator` authority is derived live from `OPERATOR_EMAILS`,
so a single fixed address is either always an operator or never one, and the mentee-landing and
operator scenarios cannot both run. GitHub's own authorize endpoint accepts a `login` parameter
that pre-selects an account, so the port carries it legitimately: `authorizeUrl({ state, login?
})`. The start route forwards a validated `?login=` (`[A-Za-z0-9-]{1,39}`) to the adapter; the
real adapter passes it to GitHub as a hint and nothing else changes; the mock derives its whole
identity from it — a stable id, that login, and `<login>@devmentor.test` as the verified email.
Harness fixtures follow the same address rule (`OPERATOR_EMAILS=mock-operator@devmentor.test`
in CI; the seeded mentor's address matches her login), and a `signInAs(login)` helper beside
`adminBrowserSession` navigates to `/api/auth/github?login=<login>`. #15's second real identity
needs nothing new.

**Mailer — SHIP.**
```
core/src/services/notifications/mailer.port.ts              interface Mailer { send({to, subject, text}) }
core/src/services/notifications/adapters/resend-mailer.ts   production delivery over Resend's HTTP API via fetchJson
core/src/services/notifications/adapters/log-mailer.ts      development default; harness via MAILER_ADAPTER=log + INTEGRATION_TEST_RUN=1
```
#13 needs email verification; #15, #23, #27 and #30 queue up behind it.

**Transport is an HTTP API, not SMTP.** Raw SMTP needs `nodemailer`; a transactional provider's
HTTP API is one `fetchJson` call that reuses B20's timeout and redaction and adds no dependency.
The provider is **Resend** (`POST /emails`, JSON body, bearer key), which closes E01's blocking
"which mail service" question. The adapter is named after the provider because its JSON shape is
not portable; env keys are `MAIL_API_KEY` and `MAIL_FROM`, and the endpoint is a constant in the
adapter. `SMTP_URL` is retired.

**Delivery semantics.** In production `MAIL_API_KEY` is required at container creation (B6).
Delivery failure makes registration fail closed with a retryable 503; the application never
reports successful registration when it could not deliver the verification link. In
`development` with no `MAILER_ADAPTER` set, the log adapter is registered automatically and a
warning is logged at boot, so `npm run dev` never shows a registration form that always 503s.

**Reading the link in the harness.** The harness already pipes the app's stdout into a log
file (`tests/integration/global-setup.ts`). The log adapter emits one structured pino line per
message (`msg: 'mail.sent'`, `to`, `subject`, `text`); a `waitForMail(to)` helper polls that
file and returns the message, so the registration scenario follows the real link end-to-end.
No second capture adapter, and no test that signs its own token to skip the mail — that would
bypass exactly the fail-closed behaviour above.

**Payment gateway — DEFER #22.** Its full surface is already determined by four issues and is
recorded here so it is designed once rather than grown ad hoc: `createCheckoutSession`,
`parseWebhookEvent`, `refund` (#22), `transfer` (#25), `createConnectAccount` /
`createAccountLink` / `getAccountStatus` (#33). Both adapters are first-class deliverables —
#34 requires the mock to expose `simulateCheckoutCompleted(...)` — and the mock is selected by
the same env-pair rule.

#### B15 · Notification fan-out — `core/src/services/notifications/notification.service.ts` · **DEFER #23**

`notify(users[], kind, payload)` → one durable `Notification` row per user **plus** one
best-effort email per user. The recurring shape is *notify both parties of a booking*: #22
confirmed, #24 cancelled, #27 answer posted, #28 note sent, #29 approved/declined, #32 dispute
resolved. #23 fixes the durability rule: the event bus is in-process and swallows handler
failures, so *"the email is best-effort and the in-product record is the durable one"*.

#### B16 · Settings with an env seed — `core/src/services/operator/platform-settings.service.ts` · **DEFER #18**

One `get()` that every consumer routes through, backed by env vars now and by a single-row
table after #31 — *"so only the storage changes"*. The reusable shape is **"config value with
an env seed and a DB override, read through one service"**, and it is why the fee snapshot in
#25 can be cheap. #31 already specifies the migration: seed the row from the env defaults so
behaviour does not change on deploy, then retire the vars in a later PR.

#### B17 · On-demand sweeps — `core/src/domain/sweep.ts` · **DEFER #22**

`AGENTS.md` has no queue and no worker, and #25 says so outright: *"There is no scheduler or
worker: completion is detected on demand."* Three sweeps are pull-based — `expirePending(now)`
(#22), `runDue(now)` (#25), `report(batchId, now)` (#30) — each triggered by a request, an
operator button, or a `tsx` script. The primitive is mostly a convention plus a shared
operator-only route shape; recording it stops the third one from inventing a cron.

#### B18 · List query & enum params — `core/src/http/list-query.ts` · **DEFER #20**

Zod-validated query params (#20: an unknown `?tag=` must be **422**, not an empty list), an
`orderBy` whitelist, and a scope injected from the session. **No issue in the backlog asks for
pagination**, so pagination is not built — but `DataTable` already takes fully-controlled
`pagination` props, so the seam exists on both sides when a list finally needs it.

#### B19 · Outcome record — `db/src/entities/base.entity.ts` (`outcomeProperties`) · **DEFER #28**

`{ decidedBy, decidedAt, outcome, outcomeNote }` as a spreadable property group beside
`baseProperties`. Reused by dispute resolution (#32), note approve/decline (#29), payout hold
(#25) and settings update (#31). Everything in this group exists so a human can read back
*why* — R18's shared operator note, made structural.

#### B20 · Outbound HTTP policy — `core/src/http/outbound.ts` · **SHIP**

```ts
fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number }): Promise<T>
// AbortSignal.timeout (default 10s); timeout, network failure and non-2xx all throw
// ServiceUnavailableError with the upstream status in the logged cause; never logs the request body
```

Node's `fetch` has **no default timeout**. E01's OAuth callback makes three upstream calls
(`/login/oauth/access_token`, `/user`, `/user/emails`); a hung GitHub would hang a route
handler indefinitely. Every future integration has the same need — Stripe (#22, #33, #34) and
the Resend mailer — and each would otherwise re-derive its own timeout and its own redaction
rules. Small, but it is the difference between "GitHub is down" degrading and hanging.

**One error, not two.** A 502 `bad_gateway` for upstream failures was weighed and rejected: no
caller can act differently on 502 versus 503, "the integration is unavailable" is true in both
cases, and browser-navigated routes redirect to `?error=unavailable` either way. The §1 table
stays one code smaller.

#### B21 · Public slug — `core/src/services/mentors/slug.ts` · **DEFER #16**

Deterministic, collision-checked, URL-safe slug generation for `/m/<slug>` (#16) and the
`/mentors` list (#20). Recorded because the first draft of this spec wrongly filed the share
link under opaque tokens (B5) and thereby hid a genuine gap: a share link is public and
re-visitable, so it needs uniqueness and stability, not secrecy and expiry.

### Frontend

#### F1 · Surface taxonomy — a convention, not a component · **SHIP (documentation)**

`AGENTS.md` today names two surfaces: public pages use Tailwind, `/admin/*` uses shadcn. E01
introduces signed-in mentee and mentor screens, which are neither. Three surfaces:

| Surface | Routes | Styling |
|---|---|---|
| `public` | landing, `/mentors`, `/m/<slug>` share link, `(auth)/*` | Tailwind utilities |
| `app` | `(mentee)/*`, `(mentor)/*` — signed in | shadcn via `@devmentor/ui`, inside `AppShell` |
| `admin` | `/admin/*` — operator | shadcn via `@devmentor/ui`, inside `AppShell` |

The mentee and mentor surfaces are the two heaviest in the backlog — sessions lists, slot
management, prices, notes, payouts — and are exactly the screens that would otherwise hand-roll
tables and forms. Public pages stay Tailwind because they are marketing surfaces with no shared
chrome. This entry ships as an `AGENTS.md` amendment; it has no code and no test of its own.

#### F2 · AppShell — `ui/src/backend/shell/AppShell.tsx` · **SHIP**

```tsx
<AppShell nav={ReactNode} user={{ displayName: string }} actions={ReactNode}>{children}</AppShell>
```

`ui` may not import `core`, so the shell cannot know what a `Role` is; and
`packages/ui/package.json` has no `next` dependency, so it cannot render `next/link` either.
Both constraints point the same way: **`nav` is a rendered `ReactNode` slot**, and the three
`app` layouts build their own `<Link>` lists inside it. The shell owns layout, chrome and the
user block; it owns no routing.

Its first caller is `admin/layout.tsx`, whose inline sidebar it replaces. That migration is
**not** cosmetic-only: `tests/integration/admin.integration.test.ts:22` asserts `link "Users"`,
and `BACKWARD_COMPATIBILITY.md`'s "What is not protected" list names that link as an asserted
semantic (it is *not* a §7 surface; §7 is the session and CSRF section). The port must keep an
accessible `link "Users"` in the tree or update the test in the same PR.

**The harness breaks earlier than the shell.** `admin.integration.test.ts:16` opens `/admin`
with no session cookie and expects the dashboard to render. The moment F3's guard lands on the
admin layout — in E01's auth slice, before F2 — that test fails unless the harness first signs
in an operator. The auth slice therefore owns the harness change: auth env in
`tests/integration/environment.ts`, the mock identity pair (B14), and the `signInAs(login)`
helper the admin test uses before its first assertion.

#### F3 · Page-level session & guards — `packages/app/src/lib/session.ts` · **SHIP**

```ts
getPageSession(): Promise<Session | null>                 // cookies() → JWT verify → live DB session
requirePageSession(): Promise<Session>                   // else redirect('/sign-in?returnTo=…')
requirePageRole(role: Role): Promise<Session>            // missing role → redirect to the caller's default home
homeFor(roles: readonly [Role, ...Role[]]): string       // deterministic default; combined-role nav remains available
```

Lives in `app`, not `core`, because `next/headers` and `redirect` are Next APIs that `core`
must not import. Used by the `(mentee)`, `(mentor)` and `admin` layouts — *"nothing of the
user's is rendered first"* (#12).

`homeFor` takes a non-empty tuple, so the zero-roles case is unrepresentable at the type rather
than handled by an invented fallback; `requireSession` (B3) produces that type from the stored
row.

It does not synthesize a fake `Request` from `cookies()`. A shared internal operation accepts a
cookie value plus the scoped cradle; the route-facing `requireSession(req, cradle)` and page
helper both delegate to it. Both paths verify the JWT, check `session_version`, and return
current stored roles.

#### F4 · WorkflowAction — `ui/src/backend/actions/WorkflowAction.tsx` · **SHIP (minimal)**

```tsx
<WorkflowAction endpoint="/api/…" method="POST" body={…} label="…"
                onSuccess={…} confirm={/* DEFER #24 */} />
```
Button + pending state + error surfacing, posting through `apiCall` (so the CSRF header always
rides along). This is the shape `CrudForm` and `DataTable` do **not** cover, and the backlog has
roughly a dozen: Pay (#22), Cancel (#24), Run payouts (#25), Send for approval (#28), Approve /
Decline (#29), Open batch (#30), Raise / Resolve dispute (#32).

E01's consumer is **sign out** — a POST that clears the cookie, after which `onSuccess` performs
a **hard** navigation (`window.location.assign('/')`), not a client-side push: the
server-rendered tree still holds the signed-in user, and a soft push can render stale chrome
until the next server round-trip. The `confirm` prop is deferred to #24, the first story that
requires it and states its contract precisely: a confirmation that *"states the rule and the
outcome … before the mentee confirms"*. It also needs shadcn `dialog`, which is not installed.

#### F5 · Form field coverage — `ui/src/backend/forms/CrudForm.tsx` · **SHIP (partly)**

`CrudForm` currently renders raw `<input>` / `<textarea>` / `<select>`; only `button` and `card`
are installed from shadcn. For the `app` surface to be a shadcn surface, the fields must be too.

- **SHIP**: `npx shadcn@latest add input label` in `packages/ui`; back the existing renderers
  with them; add the `password` field type (#13 needs it).
- **DEFER**: `select` / `textarea` / `checkbox` / `badge` / `table` / `dialog`, and the
  `multiselect` (#16 stack tags) and `datetime` (#17 slots) field types — each with the story
  that needs it.

#### F6 · Status panel — extend `ui/src/backend/feedback/EmptyState.tsx` · **DEFER #25**

Six screens need "here is why you cannot do this yet" copy: held payout reason (#25), answer
still owed (#27), awaiting approval (#28), private-note notice (#29), the D18 stop banner (#30),
out-of-bounds prices (#31). This is `EmptyState` with a `tone` prop, **not** a new component —
the DRY answer is to widen the existing one when the second consumer appears.

#### F7 · Negative-assertion test helper — `tests/integration/assertions.ts` · **SHIP**

```ts
expectAbsent(snapshot, { role?: string; text?: string | RegExp }): void
```
A recurring and easily-forgotten test shape: the accessibility snapshot must *not* contain
something. #20 asserts no `searchbox` role, #26 no audio or video control, #28 no textbox for
the mentee, and **E01-S03 asserts there is no "become a mentor" path anywhere** (R07). A shared
helper makes the prohibition legible instead of buried in a `.not.toMatch`. Its consumer is the
harness, which is what the gate admits.

---

## 📝 Data Model

This spec fixes three shapes and owns one small table:

- `users.session_version` (integer, not null, default 0) — B2's revocation counter, added by
  E01's identity migration.
- `auth_rate_limits` (B8) — `key text PRIMARY KEY`, `window_start timestamptz`, `count int`;
  entity `AuthRateLimit` in `packages/db/src/entities/auth/rate-limit.entity.ts`, migration with
  `up` and `down` in E01 Slice 4. The one entity that does **not** spread `baseProperties`, for
  the reason given in B8.
- `outcomeProperties` (B19) — a spreadable property group in `base.entity.ts` beside
  `baseProperties`, added when #28 needs it.
- `ProcessedWebhookEvent` (B13) — `eventId` unique, `type`, `receivedAt`; added when #22 needs it.

Every other entity keeps `baseProperties`, must be wrapped in `defineSingletonEntity`, and must
be added by hand to the `entities` array in `packages/db/src/entities/index.ts`. Note for
whoever touches `packages/db/src/entities/base.entity.ts` next: its docblock says *"a uuid v7
primary key (time-sortable)"* but the implementation is `crypto.randomUUID()`, which is **v4**.
Nothing in the backlog sorts by id; fix the comment, not the ids.

## 📝 API Contracts

No new endpoint. Three contract changes later work depends on, recorded so they are not
discovered late:

1. **`ServiceUnavailableError` → 503 `service_unavailable`** and **`TooManyRequestsError` → 429
   `rate_limited`** (with `retryAfterSeconds` and a `Retry-After` header) join the code table in
   §1. Additive; existing codes keep their meaning.
2. **Every non-`GET`/`HEAD`/`OPTIONS` `/api/*` route requires `x-devmentor-request`** (B3),
   including `makeCrudRoute`'s `POST`/`PUT`/`DELETE`. The in-repo blast radius is zero because
   `apiCall` is the only sanctioned fetch site and already sends it; §7 records the header as a
   breaking surface.
3. **The webhook route will be the sole non-enveloped, non-CSRF `/api/*` route** (B13). §1 must
   record that exception when #22 lands, not retroactively.

And one contract change explicitly *deferred* rather than smuggled in: threading a `Session`
into `makeCrudRoute`'s `resolve` (B4) is a §2 change to `MakeCrudRouteOptions` / `CrudService`.
It is designed by #23, not by E01.

The envelope itself (`{ ok, data }` / `{ ok, error }`) is unchanged and stays declared twice —
once in `core/src/http/apiHandler.ts`, once in `ui/src/backend/api/types.ts` — because `ui`
must not import `core`.

## 📝 UI/UX

Covered by F1–F7. The only genuinely new interaction pattern is `WorkflowAction` (F4): a button
that changes server state, as distinct from a form that submits a record. Everything else either
exists (`CrudForm`, `DataTable`, `feedback/*`) or is a widening of it.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Behaviour | Primitive |
|---|---|---|
| `SESSION_SECRET` unset in development or test | Auth routes fail closed (a browser-navigated route redirects to `/sign-in?error=unavailable`); the app still builds, boots, and serves public pages | B6 |
| `SESSION_SECRET` unset in production | First container creation throws; the process does not serve. `next build` is unaffected because it never creates the container | B6 |
| A fake adapter switch set without `INTEGRATION_TEST_RUN=1` | The env schema refuses; the app fails at boot, loudly | B14 |
| Session cookie tampered, expired, or carrying the wrong `aud` | `verify` returns `null` → treated as signed out; nothing of the user's renders first | B2, F3 |
| A user signs out, but the cookie was copied | `session_version` is bumped; the copy is dead on its next guarded request | B2, B3 |
| `SESSION_SECRET` rotated | `SESSION_SECRET_PREVIOUS` keeps existing sessions and in-flight verification links valid for their remaining lifetime | B2, B5 |
| A stored `users.roles` is empty despite the constraint | Internal error, logged; not a 401 and not a redirect loop | B3 |
| Two concurrent sign-ins create the same user | `UserService` handles the expected identity constraint and re-reads the winner — no 409 for a double-click | B10 |
| Upstream (GitHub, Resend, later Stripe) hangs or answers non-2xx | `ServiceUnavailableError`; the route fails closed rather than hanging | B20 |
| A user lacks the role required by a scoped route | `ForbiddenError` before the explicit concept-scoped service method is called | B4 |
| `returnTo=//evil.example`, `returnTo=/api/users`, `returnTo=/_next/…` | Rejected; falls back to the role home | B7 |
| A browser navigates to a failing `GET` route | Redirect to a page that explains it — never a JSON envelope rendered as a page | Architecture |
| A state-changing request arrives without `x-devmentor-request` | 403 from `apiHandler` before the route body runs | B3 |
| An app process restarts or another instance receives the next attempt | PostgreSQL-backed counters remain shared and enforce the same window | B8 |
| No client IP is derivable | Per-IP key skipped, per-email key still enforced, one warning per process | B8 |
| Rate limit exceeded | `429 rate_limited` with `Retry-After`; generic message that does not reveal whether the email exists | B6, B8 |
| Hashing gate saturated | 503 without touching the counter, because the gate is acquired before the limit is consumed | B8, B9 |
| `MAIL_API_KEY` unset in production | Container creation throws, same as the session secret | B6, B14 |
| Mail delivery fails at runtime | Registration fails with retryable 503; no false success | B14 |
| A later best-effort notification email fails | Logged; its in-product notification remains durable | B15 |
| Integration harness serves plain HTTP with `NODE_ENV=production` | A `secure` cookie is accepted only because Chrome trusts loopback origins. Load-bearing: a harness serving from a non-loopback host would break sign-in in tests | B2 |

## 📝 Risks & Impact Review

**Blast radius.** Everything marked SHIP is either new or replaces a stub. The exceptions:

- `readSession` currently returns `null` and `requireSession` always throws. E01 replaces this
  stub pair with the canonical live `requireSession(req, cradle)` while there are no production
  consumers; the §2 signature change and every internal caller land together.
- `apiHandler` enforcing `requireCsrfHeader` on every non-`GET` route rejects any client that is
  not `apiCall`. `apiCall` already sends `x-devmentor-request` and is the only sanctioned fetch
  site, so the in-repo blast radius is zero — but it must land together with the routes it
  guards.
- **`AppShell` replacing `admin/layout.tsx`'s sidebar is not risk-free.** It must preserve an
  accessible `link "Users"` or update `tests/integration/admin.integration.test.ts:22` in the
  same PR; the "What is not protected" list names that link as asserted behaviour.
- **The production-secret check at container creation** is a new class of boot failure. It is
  scoped to `NODE_ENV=production`, exercised by a unit test in both directions, and kept out of
  the zod schema precisely so the CI build job — which runs with no env — is untouched.

**The main risk of this spec is the spec itself:** a catalogue of 28 primitives is a temptation
to build 28 primitives. The ship gate is the mitigation, and review already caught it leaking
once — three entries marked SHIP would have landed with tests and no caller. The gate now reads
"a real call site in E01's delivered code", and a PR that creates `core/src/money/` before
issue #18 is in scope should be sent back on `AGENTS.md`'s YAGNI rule alone.

**Rollback is per slice, not per primitive.** The first draft claimed every SHIP item was
"additive and independently revertable"; B8 adds a migration, F5 changes how every existing
`CrudForm` field renders, F2 replaces the admin layout, and B3's CSRF enforcement changes every
mutating route. Each E01 slice is one PR and reverts as a unit, matching how the code actually
lands:

| Slice | Reverts together | Note |
|---|---|---|
| Auth (E01 Slice 2) | B1 B2 B3 B5 B6 B7 B10 B14-GitHub B20 F3 F4, ESLint patterns, harness sign-in | returns auth to its stub; every guarded route denies, the pre-change behaviour exactly. The identity migration stays applied per E01's rollback rule |
| Shell (E01 Slice 3) | F1 F2 F7 | presentational; no schema |
| Email (E01 Slice 4) | B8 (+ `auth_rate_limits` migration down) B9 B14-mail F5 | revert before the auth slice if both must go |

**Compatibility.** One breaking change, owned by the E01 spec: the `Role` union (§2 and §7)
gains `operator` and renames `student` → `mentee`.

## 📝 What we build instead of buying, and what that costs

E01 rejects Auth.js / NextAuth. The reasons are structural, not line-count:

- Auth.js owns `/api/auth/[...nextauth]` as a catch-all, which would break the `{ ok, data }`
  envelope convention §1 protects.
- Its `SessionProvider` / `useSession` model is a client-side session fetch, which directly
  contradicts #12's *"nothing of the user's is rendered first"*.
- Its database adapter puts a vendor between `core` and `db` — the dependency-inversion rule
  the standards spec applies to every other integration.

What it carries that this repo can skip is real: an adapter abstraction, 20+ providers, JWE
encryption, cookie chunking, a CSRF-token endpoint, edge middleware splitting, and v5 beta
churn — all cost against a 25-hour first iteration (D03).

But the library gets five things right that a from-scratch implementation forgets, so they are
written into this spec rather than left to be rediscovered:

1. **No automatic account linking on email alone** — Auth.js raises `OAuthAccountNotLinked`.
   E01 links only to a locally verified row (see its account-linking rule).
2. **Revocable sessions** — B2's `session_version`.
3. **Keyed secret rotation** — B2's `SESSION_SECRET_PREVIOUS`.
4. **`__Host-` cookie prefixes** — weighed and deferred in B2, with the reason.
5. **An explicit `SameSite` on the OAuth state cookie** — `Lax`, never `Strict`; see E01.

That list is the honest cost of building rather than buying, and it is paid here.

## 📋 Phasing

This spec ships **no phase of its own**. Every SHIP entry is delivered inside a slice of
`.ai/specs/2026-09-04-accounts-and-roles.md`, against a real consumer. E01 has four slices and
no fifth; the first is test tooling only.

| Delivered in | Primitives |
|---|---|
| E01 Slice 2 — GitHub sign-in (#12) | B1 Clock · B2 Session · B3 canonical live session, CSRF in `apiHandler`, Cradle registrations · B5 stateless tokens · B6 config gate (503 + production-secret check) · B7 return-to · B10 concept-owned identity transaction · B14 GitHub identity port, mock via `login` hint, the env-pair rule · B20 Outbound policy · F3 page guards · F4 minimal sign-out action · ESLint third-party patterns · harness `signInAs` |
| E01 Slice 3 — signed-in shell (#12, #14) | F1 Surfaces · F2 AppShell and combined-role navigation · F7 `expectAbsent` |
| E01 Slice 4 — email and password (#13) | B8 rate limiter, `AuthRateLimit` entity + migration, 429, `TRUSTED_PROXY_HOPS` · B9 scrypt · B14 Resend + log mailer, `waitForMail` · F5 shadcn input/label + `password` field |

Deferred entries are delivered by the issue named in their catalogue row:

```
#15 invitations          B5 opaque tokens
#16 mentor page          B21 Public slug
#18 mentor prices        B12 Money        B16 Settings
#20 mentor list          B18 List query
#21 booking              B11 Transitions
#22 Stripe Checkout      B13 Webhook inbox (+ apiHandler csrf:false)  B14 payment port  B17 Sweeps  B10 afterCommit
#23 booking notified     B4 explicit scoped list routes  B15 Notifications
#24 cancellation         F4 confirm variant
#25 fee split            F6 Status panel
#26 text session         B3 assertParty
#28 session note         B19 Outcome record
#32 dispute              B3 operatorReadException
```

## 📋 Implementation Plan

There is no standalone implementation plan, by design — a primitive built without a caller is
the failure mode this spec exists to prevent. The steps live in the E01 spec's plan, and each
carries its own unit tests to the repository's 100%-per-file bar with the file added to
`coverage.include` in `vitest.config.mts` in the same change.

Three documentation steps do belong here and are owed by whichever PR first ships a primitive:

1. **`AGENTS.md`** — the three-surface taxonomy (F1); the rule that `time/` and `persistence/`
   are cross-cutting siblings of `http/`, not concept folders; the navigated-vs-fetched route
   rule; and the rule that state-changing routes are JSON-only and called through `apiCall` or
   `CrudForm`.
2. **`BACKWARD_COMPATIBILITY.md` §1** — the 503 `service_unavailable` and 429 `rate_limited`
   codes (B6); **§7** — the CSRF header is now enforced by `apiHandler` on every mutating route.
3. **`README.md`** — the env additions: `SESSION_SECRET(+_PREVIOUS)`, `GITHUB_CLIENT_*`,
   `TRUSTED_PROXY_HOPS`, `MAIL_API_KEY`, `MAIL_FROM`, `MAILER_ADAPTER`, `AUTH_IDENTITY_ADAPTER`,
   `INTEGRATION_TEST_RUN`, and which of them production requires at boot.

## 📝 Open items for a future spec

Not open questions blocking this design — items deliberately left to the story that owns them:

- **Q18** (#26) — whether the text exchange lives in DevMentor at all. Blocking before #26 is
  implemented. Nothing in this catalogue assumes an in-product transcript is permanent.
- **Q19** (#25) — how mentors are paid in the first iteration. Blocking before the first payout.
- **Q20** (#20) — whether mentor-page visits are recorded. Blocking before 2026-11-28.
- **Stripe topology** (#25) — separate transfers vs destination charges. #25 says that story's
  spec must choose; the port surface in B14 supports either.
- **The `makeCrudRoute` session seam** (#23) — how a `Session` reaches `resolve` without
  breaking `CrudService`. Designed by #23; see B4.
- **Per-request session memoisation** — React `cache()` around the page-side resolver, when the
  duplicate lookups accepted in B3 show up in a profile.

## 📝 What the 2026-09-08 revision changed

A grilling review (32 questions, all resolved) reworked this spec against the repository as it
actually is and against the E01 spec's 2026-09-06 revision. The body above is authoritative;
this list orients a reviewer reading the diff.

- **Gate.** "A real *production* call site" became "a real call site in E01's delivered code,
  production or harness", which is what F7 always needed. Entry count corrected to 17/11.
- **Clock.** Enters the auth services by constructor injection and reaches `jose` as
  `currentDate`; B8 no longer takes `now` as a parameter.
- **Tokens.** The `v1.` prefix is gone; every token carries an `aud` and every verifier names
  one. Purpose tokens use the same jose/secret family, with `_PREVIOUS` on verify. B5 states
  that a purpose token never authenticates the bearer.
- **CSRF.** Enforced once in `apiHandler` with `{ csrf: false }` reserved for B13; mutating
  routes are JSON-only by rule.
- **Config gate.** Three tiers: route-gated integration credentials; `SESSION_SECRET` and
  `MAIL_API_KEY` required in production at container creation (not in the schema, so the CI
  build survives); dangerous fake-adapter configuration refused at boot.
- **Rate limiting.** Now owns its table (`AuthRateLimit`, natural PK, hashed keys, inline
  expiry), the 429 error with `Retry-After`, `TRUSTED_PROXY_HOPS`, the policy numbers, and the
  gate → limiter → hash ordering that keeps E01's "a 503 is not counted" true.
- **Hashing.** `bcryptjs` → `scrypt`, following E01. The spec's new-dependency claim is now
  true: `jose` only.
- **Adapters.** Fake selection is described as what it is — an explicit env pair refused when
  half-set — for every fake, present and future. The GitHub mock takes its persona from a
  `login` hint because a fixed identity cannot coexist with a live operator allowlist. Mail
  moves from SMTP to Resend's HTTP API through `fetchJson`, retiring `SMTP_URL` and closing
  E01's blocking open question; the log mailer is the development default and the harness reads
  links from the app log it already captures.
- **Outbound.** One error (`ServiceUnavailableError`) for every upstream failure; no 502.
- **Return-to.** Rejects `/api/` and `/_next/` as well as foreign origins.
- **Page guards.** `homeFor` takes a non-empty tuple; an empty stored role set is an internal
  error; sign-out ends in a hard navigation; cookie strings are hand-rolled.
- **Corrections.** `SDLC.md` is cited for what it says (the `risk-high` gate), the uuid note
  points at `base.entity.ts`, F2 cites the "What is not protected" list rather than §7 and
  names the unauthenticated `/admin` test as the earlier breakage, the ESLint boundary claim is
  stated as convention until the third-party patterns land, and the phasing table follows
  E01's four slices instead of a Slice 5 that no longer exists.
- **Rollback.** Per slice, not per primitive.

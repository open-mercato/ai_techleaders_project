# DevMentor — Platform Primitives

Date: 2026-09-04
Status: **active, standing reference** — see "Lifecycle" below
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

This document does **not** follow the normal spec lifecycle in `AGENTS.md`, and that is
deliberate. It ships no code of its own: every `SHIP` entry is delivered inside a phase of the
E01 spec, and every `DEFER` entry is delivered by the issue named in its catalogue row. It can
therefore never move to `.ai/specs/implemented/`.

It is the same kind of artifact as `.ai/specs/2026-09-01-engineering-standards.md` — a standing
reference that stays `active` in `.ai/specs/` and is amended as entries land, rather than a
capability spec that ships and retires. The rule that a spec is frozen once it moves to
`implemented/` or `archive/` still binds: neither move ever happens here, so amendment stays
legal. When a `DEFER` entry is built, the story's own spec is the design authority for it and
this file's row is updated to point at that spec.

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

1. **A catalogue** — every primitive with its interface, its home, its rationale, and the
   backlog evidence for it. Design work done once, that later stories read instead of
   re-deriving.
2. **A ship gate** — each entry is `SHIP` (E01 has a real *production call site*, not merely a
   plausible one) or `DEFER #n` with the issue that unblocks it. A deferred primitive is a
   paragraph in this file, not an empty folder in the tree.

The gate is deliberately strict about what counts as a consumer. An earlier draft of this spec
marked `scopedList`, `requireAnyRole` and the opaque-token helpers as `SHIP`; review found that
each would land with tests and **zero production callers** in E01 — precisely the artefact this
spec argues against. They are deferred below, and `requireAnyRole` is dropped entirely because
no issue in the backlog actually needs it (every "more than one role may do this" case in the
backlog is a *party* check, not a role check).

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
  persistence/   + transaction.ts                               (new; NOT named `db/` — see below)
  services/<concept>/…                                          (concept-scoped, unchanged)
  services/<concept>/<name>.port.ts + adapters/                 (ports, per the standards naming table)

packages/ui/src/backend/
  api/  forms/  tables/  feedback/                              (exists)
+ shell/         AppShell.tsx
+ actions/       WorkflowAction.tsx

packages/app/src/
+ lib/           session.ts                                     (next/headers lives here, not core)
```

`core/src/money/`, `core/src/domain/` and the webhook module are named in the catalogue but
**are not created until their trigger issue**. Creating a folder to hold one deferred file is
the speculative structure this spec exists to avoid.

The helper is `core/src/persistence/transaction.ts`, not `core/src/db/transaction.ts`: a folder
named `db` inside `core` would sit one import line away from `@devmentor/db` and read as the
same thing to anyone scanning the file.

Two placement rules this establishes, both forced by the existing ESLint boundaries in
`eslint.config.mjs`:

- **`core` never imports `next`.** Anything needing `next/headers`, `redirect`, or the App
  Router lives in `packages/app/src/lib/`. `core/src/http/auth.ts` stays framework-free.
- **`ui` never imports `core`.** No UI primitive may reference `Role`, `Session`, or an
  `AppError`. `packages/ui/package.json` also has **no `next` dependency** (React is a peer dep
  only), so `AppShell` cannot render `next/link` — it takes the rendered navigation as a
  `ReactNode` slot and the caller in `app` supplies the links.

And one new rule, from a failure mode review caught in the first draft:

- **A route a browser *navigates to* redirects; a route a browser *fetches* envelopes.**
  `apiHandler` answers every `AppError` with `content-type: application/json`, which is correct
  for `apiCall` and wrong for a `<a href="/api/auth/github">`. Browser-navigated `GET` routes
  catch their own failures and redirect to a page that can explain them.

---

## 📝 The catalogue

`SHIP` = E01 has a real production call site. `DEFER #n` = the issue that first needs it; do
not create the file before then. 28 entries: 16 `SHIP`, 12 `DEFER`.

### Backend

#### B1 · Clock — `core/src/time/clock.ts` · **SHIP**

```ts
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() }
```
Registered on the `Cradle` as `clock: asValue(systemClock)`; tests inject a fixed clock.

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
issue(user: { id: string; role: Role; sessionVersion: number }): { cookie: string; expiresAt: Date }
verify(cookieValue: string): SessionClaims | null    // stateless: signature + expiry only
clear(): string                                       // the expiring Set-Cookie value
```

Token format `v1.<base64url(payload)>.<base64url(hmac)>`, HMAC-SHA256 over the payload with
`SESSION_SECRET` (≥ 32 bytes from `env.ts`), compared with `crypto.timingSafeEqual`. Payload
`{ sub, role, sv, iat, exp }`, 24 h, no refresh flow.

**Deviation from the standards spec, stated deliberately.** That spec says "JWT, HS256". This
is a compact signed cookie: the same construction (HMAC-SHA256 over a base64url payload), no
JWT header, no `alg` field, and therefore no algorithm-confusion surface. It uses `node:crypto`
only, so it adds no dependency, which the same spec asks for (*"don't add a dependency for
something 20 lines of local code covers"*). No cryptographic primitive is implemented — only a
standard MAC-then-encode composition. If a third party ever needs to verify a DevMentor token,
swap the implementation for `jose` behind this interface; no caller changes.

**Revocation — `sv` (session version).** A purely stateless token cannot be revoked: a copied
cookie stays valid for its full 24 hours regardless of sign-out, an operator demotion would take
up to a day to bite, and a changed password would not invalidate anything. `SDLC.md:105` treats
sessions as blocker-grade, so the design carries a `session_version` integer on `users`, mirrored
as `sv` in the payload. Bumping the column invalidates every outstanding session for that user
immediately, and covers sign-out-everywhere, demotion, and password change with one column.

The cost is one indexed primary-key lookup, and it is paid only where it matters — see B3
`requireLiveSession`. `verify()` itself stays pure and DB-free, so `readSession`'s signature
(a `BACKWARD_COMPATIBILITY.md` §2 export) is unchanged.

**Key rotation.** `SESSION_SECRET_PREVIOUS` (optional) is accepted on *verify* only, never on
issue. Rotating is then: set the new secret, move the old one to `_PREVIOUS`, deploy; existing
sessions keep working for their remaining lifetime, and dropping `_PREVIOUS` a day later
completes the rotation. Without this, rotating a leaked secret signs every user out at once.
The `v1.` prefix is a *format* version, not a key id, and stays that way.

Cookie flags: `httpOnly`, `secure` in production, `sameSite=lax`, `path=/`, name
`devmentor_session` (§7 surface — kept). The `__Host-` prefix, which would let the browser
enforce `Secure` + `path=/` + no `Domain`, was weighed and rejected for now: it forbids
`Secure`-less cookies entirely, and `npm run dev` serves plain HTTP on localhost. Revisit if a
staging environment on a real hostname appears.

#### B3 · Authorization — `core/src/http/auth.ts` (extended) · **SHIP (partly)**

| Export | Status | Evidence |
|---|---|---|
| `requireSession(req)` | exists | — |
| `requireRole(session, role)` | exists | #21, #25, #30, #31, #32 |
| `assertOwnership(session, ownerId)` | exists | #22, #24, #27 |
| `readSession(req)` — real implementation | **SHIP** | #12; today it returns `null` unconditionally |
| `requireLiveSession(cradle, claims)` | **SHIP** | B2 revocation; returns the *stored* role and checks `sv` |
| `requireCsrfHeader(req)` | **SHIP** | #14, #21, #24, #29, #31; `apiCall` already sends `x-devmentor-request`, nothing checks it |
| `assertParty(session, party: { userIds: string[] })` | DEFER #26 | #26: the check is two-sided — the mentee's id **or** the mentor's user id |
| `operatorReadException(session, reason: string)` | DEFER #32 | #32 calls the operator reading session text *"a scoping exception that must be explicit"*; #29 needs the same |
| ~~`requireAnyRole`~~ | **dropped** | No issue needs it. Every "either of two roles" case in the backlog (#26, #27, #32) is a *party* check, which `assertParty` covers |

`requireLiveSession` is the seam that makes `sv` real:

```ts
requireLiveSession(cradle: Cradle, claims: SessionClaims): Promise<Session>
// one findOne(User, { id: claims.sub }) → 401 if absent,
// 401 if user.sessionVersion !== claims.sv, and returns { userId, role: user.role }
```

It runs inside `withScope`, so it has an `em`. Every **mutating** route and every **layout
guard** calls it; `readSession` alone (stateless, no DB) is enough for a purely presentational
read. The stored role wins over the token's copy, which also removes the operator-demotion lag.

`operatorReadException` deserves a note: it does nothing `requireRole(session, 'operator')`
does not, except be **greppable and separately testable**. Two paths in the backlog let the
operator read data the party-scoping rules otherwise forbid. A named marker means an auditor
finds every such path with one search, and a test can assert the set has not grown.

#### B4 · Scoped list dispatch — `core/src/http/scoped-list.ts` · **DEFER #23**

```ts
scopedList<T>(session: Session, handlers: Partial<Record<Role, () => Promise<T>>>): Promise<T>
```
Picks the handler for `session.role`; **throws `ForbiddenError` for a role with no handler** —
fail closed, per the standards spec.

The most repeated authorization requirement in the backlog is *"X sees only their own Y"* (#23,
#26, #27, #28, #29, #32), and #23 states the rule that makes it safe: the scope comes from the
session, **"never a `userId` parameter from the client"**. `scopedList` makes that structural —
there is nowhere in the signature to put a client-supplied id.

**Why it is deferred despite E01 touching a list.** The obvious E01 consumer, `/api/users`, is
not one. That route is built with `makeCrudRoute`, whose `resolve` is `(cradle: Cradle) =>
CrudService` — it receives no `Request` and no `Session`, so there is nowhere to obtain the
session `scopedList` needs. Wiring one in means changing `MakeCrudRouteOptions` or
`CrudService`, both protected §2 exports with behaviour asserted by `makeCrudRoute.test.ts`, to
serve a handler map with exactly one entry behind an `authorize` that already enforces the same
role. #23 is the first genuine consumer, where `mentee → listForMentee` and
`mentor → listForMentor` actually branch; the `makeCrudRoute` session seam is designed then,
against a route that needs it, and listed as a §2 change in that PR.

E01 uses `authorize` with `requireRole` instead — one line, no contract change.

#### B5 · Purpose-bound tokens — `core/src/services/auth/token.service.ts` · **SHIP (partly)**

```ts
// Stateless, nothing stored. OAuth `state`, email verification.          SHIP
signPurposeToken({ purpose, subject, ttlSeconds }): string
verifyPurposeToken(token: string, purpose: string): { subject: string }   // throws on bad/expired

// Stored — a hash in the database, so it can be single-use and revocable. DEFER #15
mintOpaqueToken(): { token: string; tokenHash: string }
hashToken(token: string): string
```

Purpose-binding is the point: a verification token must not be replayable as an invitation
token. E01 uses the stateless pair for the OAuth `state` (#12) and email verification (#13).
The opaque pair is deferred to #15, its first real consumer — invitation links with `tokenHash`
unique and *"constant-time hash compare"*.

**Correction to the first draft:** it listed the mentor share link (#16) as an opaque-token
consumer. It is not — a share link is a public, re-visitable URL, i.e. a **slug**, not a
single-use secret. See B21.

#### B6 · Fail-closed config gate — `core/src/http/errors.ts` + `config/env.ts` · **SHIP**

Add `ServiceUnavailableError` (503, code `service_unavailable`) to the `AppError` family, and
the rule it enforces:

> Secrets and integration credentials are `optional()` in the zod env schema and checked **at
> the route**, not at boot. A missing `GITHUB_CLIENT_SECRET` makes `/api/auth/github` fail
> closed; it never prevents the app from building or booting.

This extends `AGENTS.md`'s existing "the app must build and boot with no database reachable"
discipline to every integration. #12 asks for it by name; #22 and #34 restate it for Stripe
(*"optional with fail-closed routes"*). A new error code is additive under §1. Per the
navigated-vs-fetched rule above, a browser-navigated route renders the 503 as a redirect to a
page that explains it, not as a JSON envelope.

#### B7 · Safe return-to — `core/src/http/return-to.ts` · **SHIP**

```ts
safeReturnTo(value: string | null | undefined, fallback: string): string
```
Accepts only a same-origin **relative** path (`/…`, not `//host`, not `/\host`, no scheme);
anything else yields the fallback. Open-redirect defence.

Three flows round-trip through sign-in and must come back where they started: the invitation
link (#15, `/sign-in?returnTo=/invitation/<token>`), the email-password fallback (#13), and the
slot picker (#21, *"back to the same slot after sign-in"*). One validator, three call sites.

#### B8 · Rate limiting — `core/src/http/rate-limit.ts` · **SHIP**

```ts
consume(key: string, policy: { limit: number; windowMs: number }, now: Date): void  // throws on exceed
```
In-memory `Map`, per-IP **and** per-email key, cooldown, driven by the `Clock` (B1). The
standards spec makes this a blocker on login/register and notes it needs a stronger backend
before production traffic; counters reset on process restart. Both limitations are recorded here
rather than rediscovered.

#### B9 · Password hashing — `core/src/services/auth/password.service.ts` · **SHIP**

`bcryptjs`, cost 12 as a named constant with the reason. The one new runtime dependency this
spec adds, and the one place where "20 lines of local code" is emphatically the wrong answer.
The `argon2id` upgrade path is already fixed by the standards spec.

#### B10 · Transaction & find-or-create — `core/src/persistence/transaction.ts` · **SHIP**

```ts
withTransaction<T>(em: EntityManager, fn: (em: EntityManager) => Promise<T>): Promise<T>
// maps a Postgres unique violation (23505) to ConflictError, so the pre-check
// and the database constraint produce the same 409

findOrCreate<T>(em, find: () => Promise<T | null>, create: () => Promise<T>): Promise<T>
// on 23505 from create(), re-runs find() once and returns the winner
```

Eight check-then-act sites are named in the backlog (#21 slot booking, #22 webhook confirm, #24
cancel, #25 payout, #28 note version, #30 batch cap, #32 one-open-dispute), and #21 quotes the
house rule verbatim: *"never split a check-then-write across two round-trips without a
transaction"*.

**E01 has one**, which is why the minimal form ships now: `findOrCreateFromGithub` looks up by
`githubId`, then by verified email, then creates. Two concurrent callbacks — a double-clicked
authorise, two tabs — race into a unique violation on `users.email` or `users.github_id`.

`findOrCreate` exists because a 409 is the *wrong answer* for that race. A user who
double-clicks "Sign in with GitHub" wants to be signed in, not shown a conflict; the loser of
the race re-reads and proceeds with the winner's row. The bare `ConflictError` mapping is for
races where conflict genuinely is the answer — booking the same slot twice (#21).

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
to §1. Whoever builds it writes that exception into §1 in the same PR.

#### B14 · Ports & adapters · **SHIP (two of three)**

The pattern has **no instance in the codebase today** — a survey for `*.port.ts` / `adapters/`
returns nothing. E01 establishes it with the two ports it actually needs.

**Mailer — SHIP.**
```
core/src/services/notifications/mailer.port.ts          interface Mailer { send({to, subject, text}) }
core/src/services/notifications/adapters/log-mailer.ts  pino; the default everywhere
```
#13 needs email verification; #15, #23, #27 and #30 queue up behind it.

**GitHub identity — SHIP.**
```
core/src/services/auth/github-identity.port.ts               authorizeUrl / exchangeCode / fetchIdentity
core/src/services/auth/adapters/github-identity.ts           two fetch calls, no SDK
core/src/services/auth/adapters/mock-github-identity.ts      a fixed identity, for tests and local dev
```
The mock adapter is not a convenience — it is the *only* way E01's headline acceptance criteria
("lands on the mentee home", "a mentor's sign-in lands on the mentor home") and Phase 3's
operator sign-in in `admin.integration.test.ts` can be exercised at all without calling GitHub
from CI. The alternative an earlier draft assumed — an env-keyed "test mode" branch inside the
callback route that mints a session for an arbitrary identity — is an authentication bypass
living in production code. Behind a port it is instead a **registration decision in
`container.ts`**: the mock is selected when `GITHUB_CLIENT_ID` is unset, exactly as #22 selects
the mock payment gateway when `STRIPE_SECRET_KEY` is unset. Greppable, one place, and it fails
closed in production because production sets the variable.

**Payment gateway — DEFER #22.** Its full surface is already determined by four issues and is
recorded here so it is designed once rather than grown ad hoc: `createCheckoutSession`,
`parseWebhookEvent`, `refund` (#22), `transfer` (#25), `createConnectAccount` /
`createAccountLink` / `getAccountStatus` (#33). Both adapters are first-class deliverables —
#34 requires the mock to expose `simulateCheckoutCompleted(...)`.

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
// AbortSignal.timeout (default 10s), non-2xx -> typed AppError, never logs the request body
```

Node's `fetch` has **no default timeout**. E01's OAuth callback makes three upstream calls
(`/login/oauth/access_token`, `/user`, `/user/emails`); a hung GitHub would hang a route
handler indefinitely. Every future integration has the same need — Stripe (#22, #33, #34) and
the real mail transport — and each would otherwise re-derive its own timeout and its own
redaction rules. Small, but it is the difference between "GitHub is down" degrading and
hanging.

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
**not** cosmetic-only: `tests/integration/admin.integration.test.ts:22` asserts
`link "Users"`, and §7 of `BACKWARD_COMPATIBILITY.md` names that link as an asserted semantic.
The port must keep an accessible `link "Users"` in the tree or update the test in the same PR.

#### F3 · Page-level session & guards — `packages/app/src/lib/session.ts` · **SHIP**

```ts
getPageSession(): Promise<Session | null>          // cookies() → sessionService.verify → requireLiveSession
requirePageSession(): Promise<Session>            // else redirect('/sign-in?returnTo=…')
requirePageRole(role: Role): Promise<Session>     // wrong role → redirect to the caller's own home
homeFor(role: Role): string                       // the single place role→landing is decided
```

Lives in `app`, not `core`, because `next/headers` and `redirect` are Next APIs the ESLint
boundary forbids `core` from importing. Used by the `(mentee)`, `(mentor)` and `admin`
layouts — *"nothing of the user's is rendered first"* (#12).

**It does not call `readSession`.** `readSession(req: Request)` takes a `Request`, and
`cookies()` yields a cookie store, not a request; synthesising a fake `Request` to bridge them
would be a lie in the type system. Instead it reads the cookie value and calls
`sessionService.verify(value)` directly inside `withScope`, then `requireLiveSession`.
`readSession` keeps its exported signature (§2) and stays the route-side entry point.

#### F4 · WorkflowAction — `ui/src/backend/actions/WorkflowAction.tsx` · **SHIP (minimal)**

```tsx
<WorkflowAction endpoint="/api/…" method="POST" body={…} label="…"
                onSuccess={…} confirm={/* DEFER #24 */} />
```
Button + pending state + error surfacing, posting through `apiCall` (so the CSRF header always
rides along). This is the shape `CrudForm` and `DataTable` do **not** cover, and the backlog has
roughly a dozen: Pay (#22), Cancel (#24), Run payouts (#25), Send for approval (#28), Approve /
Decline (#29), Open batch (#30), Raise / Resolve dispute (#32).

E01's consumer is **sign out** — a POST that clears the cookie and redirects. The `confirm` prop
is deferred to #24, the first story that requires it and states its contract precisely: a
confirmation that *"states the rule and the outcome … before the mentee confirms"*. It also
needs shadcn `dialog`, which is not installed.

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
helper makes the prohibition legible instead of buried in a `.not.toMatch`.

---

## 📝 Data Model

This spec introduces **no entity of its own**. It fixes three shapes later work uses:

- `users.session_version` (integer, not null, default 0) — B2's revocation counter, added by
  E01 Phase 1.
- `outcomeProperties` (B19) — a spreadable property group in `base.entity.ts` beside
  `baseProperties`, added when #28 needs it.
- `ProcessedWebhookEvent` (B13) — `eventId` unique, `type`, `receivedAt`; added when #22 needs it.

Every entity keeps `baseProperties`, must be wrapped in `defineSingletonEntity`, and must be
added by hand to the `entities` array in `packages/db/src/entities/index.ts`. Note for whoever
touches that file next: its docblock says *"a uuid v7 primary key (time-sortable)"* but the
implementation is `crypto.randomUUID()`, which is **v4**. The ids are v4; fix the comment.

## 📝 API Contracts

No new endpoint. Two contract changes later work depends on, recorded so they are not
discovered late:

1. **`ServiceUnavailableError` → 503 `service_unavailable`** joins the code table in §1.
   Additive; existing codes keep their meaning.
2. **The webhook route will be the sole non-enveloped `/api/*` route** (B13). §1 must record
   that exception when #22 lands, not retroactively.

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
| `SESSION_SECRET` unset | Auth routes fail closed (503); the app still builds, boots, and serves public pages | B6 |
| Session cookie tampered or expired | `verify` returns `null` → treated as signed out; nothing of the user's renders first | B2, F3 |
| A user signs out, but the cookie was copied | `session_version` is bumped; the copy is dead on its next guarded request | B2, B3 |
| `SESSION_SECRET` rotated | `SESSION_SECRET_PREVIOUS` keeps existing sessions valid for their remaining lifetime | B2 |
| Two concurrent sign-ins create the same user | `findOrCreate` re-reads and both callers proceed with the same row — no 409 for a double-click | B10 |
| Upstream (GitHub, later Stripe) hangs | `AbortSignal.timeout` → typed `AppError`; the route fails closed rather than hanging | B20 |
| A role has no handler in `scopedList` | `ForbiddenError` — fail closed, never fall through to "list everything" | B4 |
| `returnTo=//evil.example` | Rejected; falls back to the role home | B7 |
| A browser navigates to a failing `GET` route | Redirect to a page that explains it — never a JSON envelope rendered as a page | Architecture |
| Rate limiter restarts (in-memory) | Counters reset; documented as needing a shared backend before production traffic | B8 |
| Mailer adapter throws | Logged and swallowed; the in-product record is the durable one | B14, B15 |
| Integration harness serves plain HTTP with `NODE_ENV=production` | A `secure` cookie is accepted only because Chrome trusts loopback origins. Load-bearing: a harness serving from a non-loopback host would break sign-in in tests | B2 |

## 📝 Risks & Impact Review

**Blast radius.** Everything marked SHIP is either new or replaces a stub. The exceptions:

- `readSession` currently returns `null` for every request, so `requireSession` always throws.
  Giving it a real implementation is the moment auth starts working; nothing today depends on
  it denying.
- `requireCsrfHeader` on state-changing routes rejects any client that is not `apiCall`.
  `apiCall` already sends `x-devmentor-request` and is the only sanctioned fetch site, so the
  in-repo blast radius is zero — but it must land together with the routes it guards.
- **`AppShell` replacing `admin/layout.tsx`'s sidebar is not risk-free.** It must preserve an
  accessible `link "Users"` or update `tests/integration/admin.integration.test.ts:22` in the
  same PR; §7 names that link as asserted behaviour.

**The main risk of this spec is the spec itself:** a catalogue of 28 primitives is a temptation
to build 28 primitives. The ship gate is the mitigation, and review already caught it leaking
once — three entries marked SHIP would have landed with tests and no production caller. The
gate now reads "a real production call site", and a PR that creates `core/src/money/` before
issue #18 is in scope should be sent back on `AGENTS.md`'s YAGNI rule alone.

**Rollback.** Each SHIP item is additive and independently revertable except B2/B3, which ship
together as Phase 1 of the E01 spec; reverting them returns `readSession` to its stub and every
guarded route to denying — the pre-change behaviour exactly.

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
   E01 links only to a locally verified row (see its C3 fix).
2. **Revocable sessions** — B2's `session_version`.
3. **Keyed secret rotation** — B2's `SESSION_SECRET_PREVIOUS`.
4. **`__Host-` cookie prefixes** — weighed and deferred in B2, with the reason.
5. **An explicit `SameSite` on the OAuth state cookie** — `Lax`, never `Strict`; see E01.

That list is the honest cost of building rather than buying, and it is paid here.

## 📋 Phasing

This spec ships **no phase of its own**. Every SHIP entry is delivered inside a phase of
`.ai/specs/2026-09-04-accounts-and-roles.md`, against a real consumer:

| Delivered in | Primitives |
|---|---|
| E01 Phase 1 (#12) | B1 Clock · B2 Session · B3 `readSession` + `requireLiveSession` · B5 stateless tokens · B6 Config gate · B7 return-to · B10 Transaction + findOrCreate · B14 GitHub identity port · B20 Outbound policy · F1 Surfaces · F2 AppShell · F3 Page guards · F4 WorkflowAction |
| E01 Phase 2 (#13) | B8 Rate limit · B9 Password · B14 Mailer port + log adapter · F5 shadcn input/label + `password` field |
| E01 Phase 3 (#14) | B3 `requireCsrfHeader` · F7 `expectAbsent` |

Deferred entries are delivered by the issue named in their catalogue row:

```
#15 invitations          B5 opaque tokens
#16 mentor page          B21 Public slug
#18 mentor prices        B12 Money        B16 Settings
#20 mentor list          B18 List query
#21 booking              B11 Transitions
#22 Stripe Checkout      B13 Webhook inbox  B14 payment port  B17 Sweeps  B10 afterCommit
#23 booking notified     B4 scopedList (+ the makeCrudRoute session seam)  B15 Notifications
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

Two documentation steps do belong here and are owed by whichever PR first ships a primitive:

1. **`AGENTS.md`** — the three-surface taxonomy (F1); the rule that `time/` and `persistence/`
   are cross-cutting siblings of `http/`, not concept folders; and the navigated-vs-fetched
   route rule.
2. **`BACKWARD_COMPATIBILITY.md` §1** — the 503 `service_unavailable` code (B6).

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

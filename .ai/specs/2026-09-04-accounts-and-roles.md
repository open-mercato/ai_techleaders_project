# DevMentor — Accounts and Roles (E01)

Date: 2026-09-04
Revised: 2026-09-06 — design review; see "What the 2026-09-06 revision changed" at the end
Revised: 2026-09-08 — aligned with the primitives spec's 2026-09-08 grilling review; see "What the
2026-09-08 revision changed" at the end
Status: active
Tracker: epic #7 — stories #12 (E01-S01), #13 (E01-S02), #14 (E01-S03)
Design authority: `.ai/specs/product-brief.md` (D07, D19, R06, R07, R18)
Primitives: `.ai/specs/2026-09-04-platform-primitives.md` — the design authority for every
mechanism this spec *uses*; referenced rather than restated. Where this revision changes a
primitive, the primitives spec is amended in the same PR.
Standards: `.ai/specs/2026-09-01-engineering-standards.md` (Security & Validation)

## 📝 TLDR

Nothing in DevMentor knows who anyone is. `readSession` in `packages/core/src/http/auth.ts`
resolves to `null` on every path, `User` has no role and no credential, and `/api/users` is
public. This spec gives the three roles the brief names — mentee, mentor, operator — a way to
sign in and a guarantee that each reaches only permitted screens. A user may hold more than
one role: mentor and operator are independent assignments, not mutually exclusive personas.
GitHub is the first method (D07: *"my GitHub is my profile"*), email and password the fallback,
and the operator role belongs to the two founders by an allowlist that no screen in the product
can grant.

It is also the first consumer of the platform-primitives spec: clock, session, tokens,
config-gating, page guards, the app shell and the first two ports all land here, against real
callers, in that order.

## 📝 Problem Statement

Every other epic is blocked on this one. A booking needs a mentee to own it (#21), a slot needs
a mentor to publish it (#17), a payout needs a Connect account attached to somebody (#19), a
dispute needs a party to raise it (#32). The backlog's dependency column makes it literal: #15,
#21 and #14 all list #12 as a prerequisite.

The evidence behind the roles is the two interviews the brief rests on. The mentee side: a
working developer, blocked the day before a release with the only senior on leave, spent 40
minutes on Stack Overflow and shipped a workaround with a TODO — *"half a day, and I still
don't trust that code"* (2026-08-20). The mentor side: a senior engineer answering the same
questions unpaid in DMs — *"two evenings a month, for free, and the notes rot"* (2026-08-22).
Neither can transact without an account.

The current state, precisely:

| Fact | Location |
|---|---|
| `readSession` has two branches and resolves to `null` on both, even when the cookie is present | `packages/core/src/http/auth.ts:22-31` |
| `Role = 'student' \| 'mentor'` — no operator, and a name no product document uses | `packages/core/src/http/auth.ts:13` |
| `User` has `email`, `displayName`, `mentorProfile` — no role, no credential, no GitHub id | `packages/db/src/entities/auth/user.entity.ts` |
| `/api/users` is public — GET **and POST** — *"until the auth concept lands"* | `packages/app/src/app/api/users/route.ts:15-18` |
| `POST /api/users` has **zero callers**; `admin/users/page.tsx` is list-only | `packages/app/src/app/admin/users/page.tsx:35` |
| `apiCall` sends `x-devmentor-request` on every request; **nothing server-side checks it** | `packages/ui/src/backend/api/apiCall.ts` |
| No env var for any secret; no `(auth)` route group; no sign-in page; no `middleware.ts` | `core/src/config/env.ts`, `packages/app/src/app` |
| No React test toolchain: `vitest.config.mts:5` is `environment: 'node'`, no jsdom, no `*.test.tsx` | `vitest.config.mts` |
| `coverage.include` contains exactly one file, at 100% per-file thresholds | `vitest.config.mts` |
| `CODE_REVIEW.md` instructs reviewers that `readSession` returning `null` is by design | `CODE_REVIEW.md` |

## 📝 Proposed Solution

Four delivery slices across the three stories, each independently reviewable and each leaving
the app working. Infrastructure and UI migrations do not share a rollback boundary with auth.

1. **React test infrastructure** — a small prerequisite PR with no production behavior.
2. **GitHub sign-in and data protection (#12)** — the session mechanism, live authorization,
   fixed multi-role storage, page-and-service enforcement, protected `/api/users`, and minimal
   role homes. Everything after this reuses the session; nothing after this re-implements it.
3. **Signed-in shell (#12)** — `AppShell`, combined-role navigation, and the R07 negative
   assertion, after auth works.
4. **Email and password (#13)** — the D07 fallback, on the *same* session, with verification,
   rate limiting and generic auth errors.

Story #14's guard obligations are not a fifth slice. E01 guards every surface that exists in
1.0; the remaining surfaces arrive with E02–E05, and each of those stories guards its own. What
carries the obligation forward is a `CODE_REVIEW.md` checklist line, not a PR that guards
screens which do not yet exist. See "Authorization enforcement" below.

### Decided here, before any consumer exists

**`student` → `mentee`, and one role → a role set.** The brief, all 28 issues and the glossary
say *mentee*; only the code says `student`. `Role` is a `BACKWARD_COMPATIBILITY.md` §2/§7
surface, so renaming it is a breaking change — but it has **zero production consumers**. That
makes this the cheapest moment to replace `Session.role` with `Session.roles: readonly Role[]`,
where `Role = 'mentee' | 'mentor' | 'operator'`. A user may hold any non-empty combination. This
is a fixed role set, not configurable RBAC: there are no permissions, inheritance, custom roles,
or role-management UI. Later services still expose explicit operations such as `listForMentee`
and `listForMentor`; authorization uses `requireRole(session, role)` against the set.

**Roles are stored; operator authority is checked live, in both directions.** Roles are never
copied into the signed session token. The token identifies a user and carries a session version;
authorization loads the current role set from the database on every guarded request. For
`mentee` and `mentor` the stored set is authoritative. For `operator` it is not, because D19
makes the founder allowlist authoritative for operator eligibility:

> `users.roles` is the persisted assignment set. New accounts receive `mentee`. Invitation
> acceptance adds `mentor` without removing other roles. **`operator` authority is derived live
> from `OPERATOR_EMAILS` on every request**, matched against the row's own verified email. The
> stored `operator` membership is a queryability cache, reconciled opportunistically on any
> request where it disagrees with the allowlist, and at sign-in. Reconciliation is idempotent,
> emits `auth.user.roles_changed`, and **never bumps `session_version`**.

The check is symmetric. Removing a founder from the allowlist takes effect on their very next
request. Adding one takes effect on their next request too — not only after they sign out and
back in, which is what a sign-in-only reconciliation would have required. Because the stored
value carries no authority, a stale cache is harmless, which is precisely why reconciliation
does not need to invalidate sessions.

**`session_version` has a closed list of triggers.** Sign-out, password change, and
`grantRole`/`revokeRole`. All three are route handlers, which matters: a role change re-issues
the caller's session in the same request rather than ejecting them, and only a route handler can
set a cookie in the App Router. Reconciliation, which can occur during a page render, is
deliberately not on the list — a page cannot re-issue, so a page must not invalidate. In 1.0 the
only live trigger is sign-out; the re-issue contract is published here for #15, which is the
first grant path.

**One logical session per user, and logout is global.** Bumping `session_version` at sign-out
invalidates every outstanding session for that user, so signing out on a laptop ends the phone
session too. This is a deliberate 1.0 simplification, not an oversight: it is what makes a
copied cookie fail immediately rather than surviving for the remainder of its 24 hours. Per-session
revocation would require a session store and is out of scope.

**No self-service product path grants a role.** R07 and D19 both require it, and #14 makes it an
acceptance criterion in the negative: a signed-in user looking for a "become a mentor" path must
find none. The mentor role is granted only by accepting an invitation (#15); operator authority
comes only from the allowlist. Granting either preserves every other role already held. The
domain service performs additive `grantRole` and subtractive `revokeRole` operations so a future
operator workflow can adjust the fixed set without a schema change; E01 exposes no general
role-management endpoint or UI.

**The R18 record is the allowlist commit.** `OPERATOR_EMAILS` is deployment configuration; adding
or removing a founder is a commit in a reviewed PR — attributable, permanent, and already part of
the process. `auth.user.roles_changed` is an in-process event whose realistic subscriber writes a
pino line to an ephemeral log; it makes the cache update observable, and it is *not* the R18
artifact. R18 names the shared operator note, and the commit is the durable record that satisfies
it.

**Authorization is enforced at the page and at the service, never at the layout alone.** In the
App Router, layouts do not re-render on client-side navigation. A guard that lives only in
`admin/layout.tsx` does not run when the router fetches `/admin/users` as a segment, so a revoked
operator — the exact case the live allowlist check exists for — would still be served the page.
Every guarded `page.tsx` therefore calls the guard itself, and the service performing the read
requires an authorized session independently. Layout guards remain, for the redirect UX; they are
not the boundary.

**Account linking requires local verification.** Matching a GitHub identity to an existing row by
email alone is an account-takeover vector, because before E01 `POST /api/users` is public and
anyone can create a row for any address. The rule:

> A GitHub identity links to an existing `users` row **only when that row's own
> `email_verified_at` is set**. Otherwise the sign-in is refused with an explanation, and nothing
> is linked or created.

The population this rule protects against is finite and knowable, so E01 also empties it. The
Phase 1 migration **marks every pre-existing row verified** — those rows are founder-created
demo and seed data — and `POST /api/users` is removed in the same slice, so no unverified row
can be created after it. Between Slice 2 and Slice 4 the refusal path is therefore unreachable.
From Slice 4 it becomes reachable again in exactly one benign shape: a user who registered with a
password and has not yet clicked their verification link. They hold that link, so the advice
"verify that address first" is actionable — which it would not have been under the original plan.
Auth.js refuses the same case by default (`OAuthAccountNotLinked`); the reasoning is identical.

### Alternatives considered

- **Auth.js / NextAuth.** Rejected — the structural reasons, and the five things the library gets
  right that this spec adopts anyway, are in the primitives spec ("What we build instead of
  buying"). Summary: it owns `/api/auth/[...nextauth]` as a catch-all and would break the §1
  envelope; its `useSession` model is a client-side session fetch that contradicts #12's
  *"nothing of the user's is rendered first"*; its DB adapter puts a vendor between `core` and
  `db`.
- **Derive `operator` in the token only** (as #14 reads). Rejected — two sources of truth.
- **Stored `operator` as the authority, reconciled at sign-in.** Rejected: it revokes instantly
  but grants only after a sign-out/sign-in cycle, so onboarding a founder silently requires a
  step nobody documented.
- **A pure stateless session with no revocation.** Rejected — see the primitives spec B2; a copied
  cookie would survive sign-out for 24 hours.
- **Guards in layouts only.** Rejected — see above; it is not an enforcement boundary in the App
  Router.
- **`bcryptjs` at cost 12**, as the standards spec and primitives B9 specify. Rejected — see the
  hashing note under Data Model. The standards bullet is amended rather than ignored.
- **Password reset in scope.** Rejected: not in the brief, no decision record. A follow-up.

## 📝 Architecture

New and changed files, by package. `†` marks a platform primitive delivered here — see the
primitives spec for its interface and rationale.

```
packages/db/src/entities/auth/user.entity.ts       + roles, githubId, githubLogin, avatarUrl,
                                                     emailVerifiedAt, sessionVersion   (Slice 2)
                                                   + passwordHash                       (Slice 4)
packages/db/migrations/…-auth-identity.ts          Slice 2 (up + down + verified backfill)
packages/db/migrations/…-auth-password.ts          Slice 4 (up + down)
packages/db/src/entities/auth/rate-limit.entity.ts Slice 4; AuthRateLimit — natural text PK,
                                                     hashed key, window_start, count; the one
                                                     entity without baseProperties (primitives B8)
packages/db/src/seeders/database.seeder.ts         + a mentee, an operator; Ada becomes mentor

packages/core/src/
  time/clock.ts                                    † B1
  http/outbound.ts                                 † B20  fetchJson with a timeout
  config/env.ts                                    + SESSION_SECRET(+_PREVIOUS), GITHUB_*,
                                                     APP_URL, OPERATOR_EMAILS, TRUSTED_PROXY_HOPS,
                                                     AUTH_IDENTITY_ADAPTER, INTEGRATION_TEST_RUN,
                                                     MAIL_API_KEY, MAIL_FROM, MAILER_ADAPTER,
                                                     PASSWORD_HASH_CONCURRENCY(+_WAIT_MS)
  http/errors.ts                                   † B6   ServiceUnavailableError (503),
                                                     TooManyRequestsError (429), `headers` on AppError
  http/apiHandler.ts                               † B3   CSRF enforced on every non-GET route;
                                                     `{ csrf: false }` reserved for the webhook route
  http/auth.ts                                     † B3   canonical live requireSession,
                                                     requireCsrfHeader, Role widened+renamed
  http/return-to.ts                                † B7
  http/rate-limit.ts                               † B8
  container/container.ts                           + withRequestScope, scoped `session`,
                                                     production-secret check at creation (B6)
  container/cradle.ts                              + session, clock, sessionService, tokenService,
                                                     passwordService, identity, mailer, rateLimiter
  services/auth/session.service.ts                 † B2
  services/auth/token.service.ts                   † B5   stateless pair only
  services/auth/password.service.ts                † B9   node:crypto scrypt + concurrency gate
  services/auth/github-identity.port.ts            † B14
  services/auth/adapters/github-identity.ts        † B14  two fetch calls, no SDK
  services/auth/adapters/mock-github-identity.ts   † B14  refused outside an integration run
  services/auth/email-verification.service.ts      Slice 4
  services/auth/user.service.ts                    + findOrCreateFromGithub, grantRole, revokeRole,
                                                     registerWithPassword, authenticateWithPassword
                                                   ~ create takes an explicit typed input
  services/notifications/mailer.port.ts            † B14
  services/notifications/adapters/resend-mailer.ts † B14  Resend HTTP API through fetchJson
  services/notifications/adapters/log-mailer.ts    † B14  development default; harness via
                                                     MAILER_ADAPTER=log + INTEGRATION_TEST_RUN=1
  validators/auth/{register,login}.schema.ts       shared client/server
  validators/auth/user-create.schema.ts            DELETED (no consumers after Slice 2)
  events/event-map.ts                              + auth.user.roles_changed

packages/ui/src/backend/
  shell/AppShell.tsx                               † F2   nav is a ReactNode slot     (Slice 3)
  actions/WorkflowAction.tsx                       † F4
  forms/CrudForm.tsx                               † F5   shadcn input/label, `password` type

packages/app/src/
  lib/session.ts                                   † F3
  lib/nav.ts                                       per-persona nav (uses next/link)   (Slice 3)
  app/(auth)/sign-in/page.tsx                      GitHub first, email second
  app/(auth)/register/page.tsx                     Slice 4
  app/(mentee)/layout.tsx  home/page.tsx
  app/(mentor)/layout.tsx  mentor/page.tsx
  app/admin/layout.tsx                             + operator guard; AppShell in Slice 3
  app/admin/page.tsx  admin/users/page.tsx         + their own guard calls (not layout-only)
  app/api/auth/github/route.ts                     GET  → GitHub, sets `state`, forwards ?login
  app/api/auth/github/callback/route.ts            GET  → exchange, session, role home
  app/api/auth/{register,login,verify-email}/…     Slice 4
  app/api/auth/logout/route.ts                     POST
  app/api/users/route.ts                           GET only, operator-guarded; POST removed

eslint.config.mjs                                  + third-party boundary patterns: next/react
                                                     forbidden in core and db, next in ui (Slice 2)
tests/integration/{environment,global-setup}.ts    + auth env, `signInAs(login)`, `waitForMail(to)`
```

Four boundary facts this layout enforces — from the package manifests today, and from
`eslint.config.mjs` once Slice 2 adds the third-party patterns (the lint config currently
restricts only `@devmentor/*` workspace names, so `core ↛ next` is a convention until then):

- `core/src/http/auth.ts` takes a plain `Request` and never imports `next`. The `next/headers`
  cookie read and every `redirect()` live in `packages/app/src/lib/session.ts`.
- `ui` cannot see `Role`, so `AppShell` takes no persona. It also has **no `next` dependency**, so
  it cannot render `next/link` — `nav` is a rendered `ReactNode` slot, built in `app/src/lib/nav.ts`
  by each layout.
- `app/src/lib/session.ts` and route handlers use the same live-session operation inside a request
  scope. The app helper supplies the cookie value obtained from `cookies()`; route handlers supply
  their `Request`. Both verify the token, check `session_version`, and load current roles. There is
  no public authorization helper that trusts token claims alone.
- The container files are `packages/core/src/container/container.ts` and
  `packages/core/src/container/cradle.ts`. Registrations there are explicit and greppable; nothing
  is auto-discovered.

### Request scope and the session on the cradle

`withScope(fn)` keeps its current signature — it is a §2 export and unauthenticated and system
work still uses it. A **new, additive** export carries the request:

```ts
withRequestScope<T>(req: Request, fn: (cradle: Cradle) => Promise<T> | T): Promise<T>
```

and an internal cookie-value variant serves the page helper, which has a cookie but no `Request`.
Both register a **scoped, lazily-resolved `session`** into the awilix scope:

- it resolves to `Session | null` — a public route resolving it gets `null`, never a thrown 401,
  so failing closed remains the *caller's* explicit decision;
- awilix `.scoped()` caches the resolution, so `requireSession` and a service that also needs the
  session share **one** `findOne(User)` — which is what keeps B2's "one indexed primary-key lookup"
  cost claim true;
- services take `session` as a constructor dependency alongside `em`, so a service method can
  enforce without any route contract change.

This is why `MakeCrudRouteOptions` and `CrudService` do not change. `authorize` still returns
`void`; it denies fast and stays greppable, but **the service is the authority**. Both checks are
kept deliberately: the route check is defence in depth, the service check is the guarantee. Threading
a `Session` through `makeCrudRoute`'s `resolve` (a §2 change) remains #23's, per primitives B4.

### Session mechanism

Defined in the primitives spec B2 and not restated here. What E01 relies on: cookie
`devmentor_session` (name preserved, §7), a plain `jose` HS256 JWT with `sub`, `sv`,
`aud: 'session'`, `iat`, and `exp`, 24 h, `httpOnly` / `secure` in production / `sameSite=lax` /
`path=/`, revocation via `users.session_version`, and `SESSION_SECRET_PREVIOUS` for rotation.
Every token in the codebase carries an `aud` and every verifier names the one it accepts, so a
verification link can never be presented as a session cookie. The `Set-Cookie` string is
hand-rolled in `core` (no `cookie` package); the clock reaches `jose` as `currentDate` from the
service's injected `Clock`.

### GitHub OAuth flow

```
GET /api/auth/github                                    [browser-navigated: failures redirect]
    ├─ SESSION_SECRET or GitHub credentials missing → 302 /sign-in?error=unavailable
    ├─ state = signPurposeToken({ purpose:'oauth-state',
    │                            subject: safeReturnTo(?returnTo, '') })
    ├─ Set-Cookie devmentor_oauth_state  (httpOnly, secure in prod, SameSite=Lax, 10 min)
    ├─ login = ?login matching /^[A-Za-z0-9-]{1,39}$/, else undefined   [GitHub's own hint param]
    └─ 302 → identity.authorizeUrl({ state, login })

GET /api/auth/github/callback                           [browser-navigated: failures redirect]
    ├─ ?error=access_denied → 302 /sign-in?cancelled=1        [nothing created]
    ├─ ?state ≠ state cookie, or cookie missing, or token expired → 302 /sign-in?error=state
    │     (equality first, then signature: a purpose token proves the claim, not the bearer —
    │      the cookie comparison is what stops login CSRF; rejected before any outbound call)
    ├─ identity.exchangeCode(code)                            [fetchJson, 10s timeout]
    ├─ identity.fetchIdentity(token) → primary *verified* email required
    ├─ withRequestScope → findOrCreateFromGithub:
    │     match githubId
    │     → else match email WHERE email_verified_at IS NOT NULL  (link the id)
    │     → else create { roles:['mentee'], emailVerifiedAt: now }
    │     never writes users.email on an existing row
    │     reconcile OPERATOR_EMAILS; emit auth.user.created / auth.user.roles_changed
    ├─ new Response(null, { status: 302, headers })            [Set-Cookie + Location]
    └─ → safeReturnTo(state.subject, homeFor(user.roles))
```

Two details that are easy to get wrong and are therefore fixed here:

- **The state cookie is `SameSite=Lax`, never `Strict`.** The callback is a cross-site top-level
  navigation from `github.com`; a `Strict` cookie is not sent, so every sign-in would fail with
  `?error=state`. The standards spec's *"or `strict` for auth-only routes"* does not apply to an
  OAuth state cookie.
- **`Response.redirect()` cannot carry `Set-Cookie`.** The callback builds
  `new Response(null, { status: 302, headers: { location, 'set-cookie': … } })`.

### Selecting the identity adapter

The normal container registers only the real adapter. The mock is selected when **both**
`AUTH_IDENTITY_ADAPTER=mock` and `INTEGRATION_TEST_RUN=1` are set, and the zod env schema
**refuses to parse — failing at boot — when the first is set without the second.**

Failing at boot is a deliberate exception to B6, which says credentials are checked at the route
so a missing secret never prevents booting. That rule exists so an absent `GITHUB_CLIENT_SECRET`
does not take down the marketing site. It has no force here: the misconfiguration this guards
against would silently turn the sign-in page into "sign in as anyone", and a quiet fallback to the
real adapter would leave an operator believing the mock is active with no signal that it isn't.
B6 is amended to distinguish *missing* configuration (fail at the route) from *dangerous*
configuration (fail at boot).

The harness cannot compose the container in-process — it builds and runs the app as a child
process — so selection necessarily crosses the boundary as configuration. The port fixes the
*shape* of the seam, not its *selection*; the two-signal rule plus the boot failure is what makes
the selection safe. The same rule selects every fake, present and future: the log mailer is
`MAILER_ADAPTER=log` + `INTEGRATION_TEST_RUN=1` (Slice 4), and the payment-gateway mock will be
selected the same way. `OPERATOR_EMAILS` in `.github/workflows/ci.yml` is an obviously fake address
(`mock-operator@devmentor.test`); the real founder addresses exist only in deployment
configuration, so `ci.yml` is not a second editor of the allowlist.

**Personas come from a `login` hint.** A single fixed mock identity cannot serve this spec:
operator authority is derived live from `OPERATOR_EMAILS`, so one fixed address is either always
an operator or never one, and the mentee-landing and operator scenarios could not both run.
GitHub's authorize endpoint accepts a `login` parameter that pre-selects an account, so the port
carries it legitimately as `authorizeUrl({ state, login? })`: the start route forwards a validated
`?login=`, the real adapter passes it to GitHub as a hint, and the mock derives its whole identity
from it — a stable id, that login, and `<login>@devmentor.test` as the verified primary email
(default persona `mock-mentee`). Harness fixtures follow the same address rule: the seeded
operator is `mock-operator@devmentor.test` and the seeded mentor's address matches the login the
harness uses for her, so a mock sign-in links to the seeded row. A `signInAs(login)` helper beside
`adminBrowserSession` navigates to `/api/auth/github?login=<login>` and asserts the cookie was
stored.

## 📝 Data Model

One table changes, across two additive migrations. Both ship `up` **and** `down` (§3).

`users` — Slice 2 (`auth-identity`):

| Column | Type | Notes |
|---|---|---|
| `roles` | `text[]` not null default `'{mentee}'` | Non-empty, members drawn only from `mentee`, `mentor`, `operator` |
| `github_id` | `varchar(64)` null, **unique** | GitHub's numeric id as text |
| `github_login` | `varchar(64)` null | display only |
| `avatar_url` | `text` null | |
| `email_verified_at` | `timestamptz` null | **Slice 2**, not Slice 4 — it gates account linking |
| `session_version` | `integer` not null default `0` | bumped to revoke every session for that user |

The same migration backfills `email_verified_at = now()` for **every existing row**. Those rows
are founder-created seed and demo data; marking them verified — rather than deleting them —
keeps Ada Lovelace's row intact, which `BACKWARD_COMPATIBILITY.md` §3 protects and
`admin.integration.test.ts` asserts on.

`users` — Slice 4 (`auth-password`):

| Column | Type | Notes |
|---|---|---|
| `password_hash` | `text` null | null for GitHub-only accounts |

`text`, not `varchar(60)`: 60 characters is bcrypt's output width, and hard-coding it would pin
the column to an algorithm this spec no longer uses and close the `argon2id` upgrade path the
standards spec promises.

**The `roles` constraint, stated honestly.** The migration adds a `CHECK` rejecting empty arrays,
null members, and values outside the fixed `Role` union. It does **not** reject duplicates: a
Postgres `CHECK` cannot contain a subquery, so array-uniqueness would need an `IMMUTABLE` helper
function. Duplicate suppression is therefore an **application invariant**, enforced by
normalization in `UserService` and covered by unit tests. This is acceptable because duplicates
are benign for authorization — membership is a set test — and the cost of a helper function
outweighs a cosmetic anomaly. If DB-level enforcement is ever required, the function is the way to
add it. Note also that the union is effectively append-only once shipped: §3 grades tightening a
constraint existing rows may violate as breaking, so removing a role value later is
expand-then-contract.

Before implementing, **spike `defineEntity` + `p` builder support for a `text[]` column**. This
repo has already been surprised twice by MikroORM v7's API (`.ai/lessons.md`, 2026-09-01), and the
array representation is load-bearing for every authorization decision.

`email` stays unique — it is the link key between a password account and a GitHub identity, and
the linking rule above is what makes that safe. A row with `github_id` set and `password_hash`
null is GitHub-only; registering that email with a password is refused with a 409.
**`users.email` is never updated after creation.** There is no email-change flow in scope, and
under the live operator check the row's email is the authorization key: a well-meaning
`user.email = identity.email` inside `findOrCreateFromGithub` would silently revoke a founder's
operator access the moment they changed their GitHub primary address.

**Sensitive data.** `password_hash` and the session secret never leave the server, never appear in
a DTO, never travel in a token or a URL, and are redacted in the pino config. `UserDto` gains
`roles`, `githubLogin` and `avatarUrl`; it never gains `passwordHash`, `emailVerifiedAt`,
`sessionVersion` or `githubId`. The entity is defined with `defineEntity` + `p` builders inside
`defineSingletonEntity`, per the MikroORM v7 lesson.

**Password hashing.** `node:crypto`'s `scrypt` at OWASP parameters (N=2¹⁷, r=8, p=1) as named
constants with the reason, with `maxmem` raised explicitly — the default 32 MiB is below what
those parameters require and the call would otherwise throw. Hashing runs behind a **global
concurrency gate**: each hash holds roughly 128 MiB, and the rate limiter is per-IP-and-email
rather than global, so a few dozen distinct addresses would otherwise be several gigabytes of
concurrent allocation. Over the limit, a request waits up to `PASSWORD_HASH_WAIT_MS` and then
fails `503 service_unavailable`; that 503 does **not** count against the rate limiter, or an
unrelated burst would lock out the users who were merely unlucky. The ordering that makes this
true is fixed in primitives B8: acquire the gate slot first (an in-memory check), consume the
rate limit second, hash third — the limiter counts every attempt that reaches credential work and
never decrements.

This deviates from the standards spec's *"`bcrypt`/`bcryptjs`, cost factor ≥ 12 … the extra ~50 ms
per login is free"*. That figure describes the native binding. `bcryptjs` is pure JavaScript,
roughly an order of magnitude slower, and its async API chunks work through `setImmediate` on the
**main thread** — so cost 12 stalls the entire Next server for about a second per attempt, on the
login route. `scrypt` runs on the libuv threadpool and adds no dependency. The standards bullet is
corrected in the same PR rather than quietly ignored; the `argon2id` upgrade path it names is
unaffected.

**Seeder.** Ada Lovelace keeps her row and headline (`admin.integration.test.ts` asserts on them)
and becomes the mentor. Two rows are added: a mentee and an operator, both with
`email_verified_at` set, and from Slice 4 a password hash so the harness can sign in through the
form. The operator fixture also holds `mentor`, proving combined roles do not erase each other.
Seeded addresses follow `<login>@devmentor.test` so the mock identity adapter's persona for that
login links to the seeded row rather than creating a second one.

## 📝 API Contracts

All new auth routes `export const dynamic = 'force-dynamic'` and are wrapped in `apiHandler`.
Existing collection routes keep the repository's non-dynamic convention. The two OAuth `GET`s and
email-verification `GET` are **browser-navigated**, so they catch their own failures and return a
redirect `Response`, which `apiHandler` passes through unchanged — a user clicking "Sign in with
GitHub" never sees a JSON envelope rendered as a page.

| Route | Method | Auth | Body / query | Answer |
|---|---|---|---|---|
| `/api/auth/github` | GET | public | `?returnTo&login` | 302 to GitHub, or 302 `/sign-in?error=unavailable` |
| `/api/auth/github/callback` | GET | public | `?code&state` / `?error` | 302 + `Set-Cookie`, or 302 to `/sign-in?error=…` |
| `/api/auth/register` | POST | public, **CSRF**, rate-limited | `registerSchema` | `{ ok: true, data: { email } }` |
| `/api/auth/login` | POST | public, **CSRF**, rate-limited | `loginSchema` | `{ ok: true, data: UserDto }` + cookie |
| `/api/auth/verify-email` | GET | public | `?token` | valid → 302 to `returnTo` or role home; invalid/expired → 302 `/sign-in?error=verification` |
| `/api/auth/logout` | POST | **CSRF only** | — | `{ ok: true, data: null }` + expiring cookie; bumps `session_version` when a live session exists |
| `/api/users` | GET | **operator only** | unchanged | unchanged shape |
| ~~`/api/users`~~ | ~~POST~~ | — | — | **removed** |

Login and register carry the CSRF header requirement even though they are public. They are
state-changing — login sets a session cookie — and the standards spec requires a CSRF defence on
every state-changing route. No route calls `requireCsrfHeader` itself: `apiHandler` enforces it
for every method other than `GET`, `HEAD` and `OPTIONS` (primitives B3), so `makeCrudRoute`'s
mutating verbs inherit it and a forgotten check is impossible. The only opt-out,
`apiHandler(logic, { csrf: false })`, is reserved for the E04 webhook route. Consequently every
state-changing route is JSON-only and is called through `apiCall` or `CrudForm`, never a native
HTML form. Without it, an attacker can force a victim's browser to sign into the
*attacker's* account and then read whatever the victim does there, which matters once E04 collects
payment details. `apiCall` already sends `x-devmentor-request` on every request including GETs, so
this costs nothing on the client. The defence holds because a cross-origin POST carrying a custom
header triggers a CORS preflight the app never answers; a plain HTML form post cannot set the
header at all.

Logout requires CSRF but **not** a valid session. Sign-out is the one operation that must never
fail: under the original rule an expired cookie produced a 401 and left the stale cookie in place,
so a user could not reach a clean state without clearing cookies by hand. With no live session
there is no row to bump, and the cookie is being expired regardless.

Shared schemas in `core/src/validators/auth/`, imported by both the route and `CrudForm`:

```ts
registerSchema = { email: z.string().email(),
                   password: z.string().min(12).max(72),
                   displayName: z.string().min(1).max(120),
                   returnTo: z.string().optional() }     // re-validated by safeReturnTo
loginSchema    = { email, password: z.string().max(72), returnTo? }
```

The 72-byte cap is not cosmetic: accepting an unbounded string into a deliberately expensive hash
is free amplification, and it is bounded input to the concurrency gate above.

**Error codes** — all existing except two additions: `401 unauthorized` for a failed sign-in
(*"Invalid credentials"*, generic for unknown email and wrong password alike), `403 forbidden` for
a wrong role or a missing CSRF header, `409 conflict` for an email already tied to a GitHub
account, `422 validation_failed` with `fieldErrors`, the new **`503 service_unavailable`** when
an integration credential is unset, an upstream call fails, or the hashing gate is saturated, and
the new **`429 rate_limited`** (Slice 4) with `retryAfterSeconds` in the envelope and a
`Retry-After` header, carried by a new optional `headers` field on `AppError` that `apiHandler`
copies through.

### `registerWithPassword` — the full state matrix

The original spec defined one case. There are five, and the missing four are where the
account-takeover questions live:

| Existing row for that email | Answer |
|---|---|
| none | create `roles: ['mentee']`, `emailVerifiedAt` null, send verification |
| verified, has `password_hash` | `409 conflict` — generic "this address already has an account" |
| verified, no password, has `github_id` | `409 conflict` pointing to GitHub sign-in |
| unverified, no `password_hash` | **claim**: write the hash, send verification |
| unverified, has a `password_hash` | **claim**: overwrite the hash, send verification |

`password_hash` is written **immediately**, not held pending. `email_verified_at` is what gates
sign-in, so overwriting an unverified row's hash grants nothing: only whoever receives the mail can
verify, and verification is what issues a session. The alternative — holding the pending credential
in the verification token's subject — was considered and rejected: `signPurposeToken` produces a
signed, *unencrypted* JWT that travels in a URL through a mail relay into an inbox, which would put
a password hash outside the server, against this spec's own sensitive-data rule.

### A deliberate deviation from the standards spec

The standards spec requires auth errors to be *"generic on login/register … never revealing whether
a given email is registered"*. The 409 on `registerWithPassword` for a GitHub-tied email (#13's
acceptance criterion, *"the product refuses and points to GitHub sign-in"*) is a precise oracle for
"this address has a GitHub account here". Recorded as a deliberate trade: the alternative is a user
who cannot sign in and is told nothing. **Login stays strictly generic** — the account-existence
oracle is limited to the register path, which is rate-limited per IP and per email. Revisit at the
2026-11-28 retrospective.

The hashing deviation above is *not* recorded as a trade: the standards bullet is amended, because
its stated justification is a factual claim about a different library.

### Breaking changes

1. **`Role` and `Session` change** (§2, §7): `'student' | 'mentor'` becomes the fixed union
   `'mentee' | 'mentor' | 'operator'`, and `Session.role` becomes `Session.roles: readonly Role[]`.
   No production consumer exists; exports and compatibility entries change together.
2. **`/api/users` stops being public** (§1) in Slice 2, before real account and role data is
   exposed. Its only caller moves under the operator guard, and `admin.integration.test.ts` signs
   in first in the same PR.
3. **`POST /api/users` is removed** (§1), together with **`userCreateSchema` and its
   `@devmentor/core` export** (§2). Both have zero in-repo consumers — the route's `POST` is never
   called and the schema's docblock names a `CrudForm` call site that has never existed — so §2's
   required path ("update every in-repo consumer in the same PR") is satisfied by deleting them.
   `UserService.create` gains an explicit typed input instead of spreading into `em.create`, which
   is what keeps it from becoming a mass-assignment surface once `roles` is a column.
4. **`x-devmentor-request` becomes required** on state-changing routes, including login and
   register. `apiCall` already sends it and is the only sanctioned fetch site, so the in-repo blast
   radius is zero.

Additive: every new route, the 503 code, the `UserDto` fields, the `Cradle` keys, `withRequestScope`,
the `auth.user.roles_changed` event (§6), and every column.

**Not a breaking change:** replacing `admin/layout.tsx`'s chrome with `AppShell` in Slice 3.
`BACKWARD_COMPATIBILITY.md` §7 covers the cookie name, the CSRF header and the `Role` union — it
does not mention `link "Users"`. That link appears under **"What is not protected"** (lines
197-204), as one of the semantics the integration tests assert on, which *"change through
migrations and tests, only without the breaking-change paperwork."* The obligation survives without
the label: the signed-in admin test asserts the link, so the port keeps it or CI fails. (The
primitives spec's F2 entry makes the same §7 error and is corrected in the same PR.)

**Not** in scope and explicitly deferred: threading a `Session` into `makeCrudRoute`'s `resolve` (a
§2 change to `MakeCrudRouteOptions` / `CrudService`). #23 designs it, per primitives B4; E01 uses
`authorize` plus a service-level check, which needs no contract change.

## 📝 UI/UX

Per the three-surface taxonomy (primitives F1): `(auth)` pages are public Tailwind; `(mentee)`,
`(mentor)` and `admin` are shadcn inside `AppShell` (from Slice 3).

**`/sign-in`** — "Sign in with GitHub" is the primary action, above the email form (D07 fixes the
order, and #12 makes it an acceptance criterion). States it must render: `?cancelled=1` →
*"Sign-in was cancelled. No account was created."*; `?error=state` → a plain retry;
`?error=unavailable` → *"GitHub sign-in is not configured yet."*; `?error=verification` → an
expired-link message with a way to request another; and, until Slice 4 ships, the email form
disabled with a one-line note. A visitor who already holds a valid session is redirected to
`homeFor(roles)` rather than shown the form.

**Role homes** — `homeFor(roles)` is the single place the default landing is decided. Priority is
`operator → /admin`, then `mentor → /mentor`, then `mentee → /home`; combined-role navigation still
exposes every permitted surface. The asymmetry (`/home` vs `/mentor`) is deliberate: #12 names
`/home`, and #15 and #17 already write `/mentor` and `/mentor/slots`.

**Guards** — `(mentee)/layout.tsx`, `(mentor)/layout.tsx` and `admin/layout.tsx` each call
`requirePageRole(...)` before rendering anything, **and so does every guarded `page.tsx` beneath
them**, because a layout does not re-run on client-side navigation. A missing session redirects to
`/sign-in?returnTo=<current>`; a wrong role redirects to the caller's own home. Nothing of the
user's renders before the check (#12).

**Navigation** — `app/src/lib/nav.ts` (Slice 3) builds links from the union of the user's roles,
passed to `AppShell` as the `nav` slot. There is no "become a mentor" link and no route that would
grant the role (R07); Slice 3 asserts its absence with `expectAbsent`, against a navigation tree
that actually exists — asserting absence against an empty tree would pass for the wrong reason.

**Sign out** — the first `WorkflowAction`: POST `/api/auth/logout` through `apiCall` (so the CSRF
header rides along), then redirect to `/`.

**Accessibility** — the sign-in form has labelled fields (shadcn `label`), the cancelled and error
notices use the existing `ErrorMessage` (`role="alert"`), and the integration scenarios assert on
semantic roles rather than CSS, per `AGENTS.md`.

## 📝 Edge Cases & Failure Scenarios

| # | Scenario | Behaviour |
|---|---|---|
| 1 | GitHub credentials unset, or `SESSION_SECRET` unset outside production | 302 `/sign-in?error=unavailable`; the app builds, boots and serves public pages. Never a JSON envelope in the browser |
| 1b | `SESSION_SECRET` unset with `NODE_ENV=production` | First container creation throws and the process does not serve — checked in `createContainer`, **not** in the zod schema, so `next build` (which also runs as production, with no secrets in CI) is unaffected. From Slice 4 the same check covers `MAIL_API_KEY` unless `MAILER_ADAPTER=log` is legitimately set |
| 2 | User cancels GitHub authorisation | 302 `/sign-in?cancelled=1`; **no account created**; the screen says so |
| 3 | GitHub account has no *verified* primary email | Refused with the reason; no account created |
| 4 | GitHub email matches a row whose `email_verified_at` is **null** | **Refused, nothing linked.** Unreachable between Slices 2 and 4 (backfill + `POST /api/users` removed); from Slice 4 it means an unconfirmed registration, and the user holds the verification link they are told to use |
| 5 | GitHub email matches a locally verified row | The `github_id` is linked to it; one account, not two. `users.email` is not rewritten |
| 6 | OAuth `state` missing, tampered or expired | 302 `/sign-in?error=state`; no token exchange attempted, so a forged callback costs no outbound request |
| 7 | GitHub is slow or hangs | `fetchJson`'s 10 s `AbortSignal.timeout` → 302 `/sign-in?error=unavailable`; the route never hangs |
| 8 | GitHub returns 5xx | Same as above; nothing is created |
| 9 | Two concurrent callbacks for a new user | `UserService` catches only the expected identity constraints, re-reads the winner, and signs in both callers; unrelated violations still fail |
| 10 | Session cookie tampered or expired | `verify` → `null` → redirect to `/sign-in`; nothing of the user's rendered first |
| 11 | A signed-out user's cookie was copied | `session_version` was bumped at sign-out; the copy fails on its next guarded request. Note this also ends that user's other sessions — see "one logical session per user" |
| 12 | `SESSION_SECRET` rotated | `SESSION_SECRET_PREVIOUS` keeps live sessions valid for their remaining lifetime |
| 13 | Wrong password / unknown email | Identical generic 401 *"Invalid credentials"*; no session; the attempt is counted |
| 14 | Registering an email already tied to a GitHub account | 409 pointing to GitHub sign-in (deviation recorded above) |
| 15 | Sign-in before email verification | Refused with the reason; no session issued |
| 16 | Verification link reused, expired, or prefetched by a mail scanner | Already-verified is **idempotent, not an error**, so a scanner consuming the link does not break the user |
| 17 | Rate limit exceeded on login/register | `429 rate_limited` with `Retry-After` and a generic message that does not reveal whether the email exists; PostgreSQL counters survive process restarts and are shared across instances |
| 17b | No client IP can be derived (`TRUSTED_PROXY_HOPS=0` and no forwarded header) | Per-IP key skipped, per-email key still enforced, one warning per process |
| 18 | Hashing concurrency gate saturated | Bounded wait, then `503 service_unavailable`; the 503 is **not** counted against the rate limiter because the gate slot is acquired before the counter is consumed |
| 19 | Mentee opens a mentor screen | Redirected to `/home` (403 on the API equivalent) |
| 20 | Mentor opens `/admin` | Refused |
| 21 | Revoked operator navigates client-side from `/admin` to `/admin/users` | Refused — the page and the service each check, so the un-re-run layout is not the boundary |
| 22 | `returnTo=//evil.example`, `returnTo=https://…`, `returnTo=/api/…`, `returnTo=/_next/…` | Rejected by `safeReturnTo`; falls back to the role home. The `/api/` and `/_next/` rejections stop a validated path from landing on a JSON envelope or re-entering the OAuth start route |
| 23 | State-changing POST without `x-devmentor-request` | 403 from `apiHandler` before the route body runs — a plain HTML form post cannot forge it, and a cross-origin fetch fails preflight |
| 24 | Operator email removed from the allowlist | Operator authorization fails on the **next request**; the stored cache is reconciled opportunistically, other roles are preserved, `auth.user.roles_changed` is emitted, and `session_version` is **not** bumped |
| 25 | Operator email added to the allowlist | Authority applies on the next request, without a sign-out/sign-in cycle |
| 26 | Founder changes their GitHub primary email | Nothing happens — `users.email` is never rewritten, so operator authority is unaffected. Changing the address is an allowlist edit |
| 27 | Sign-out with an expired or tampered cookie | Succeeds: the cookie is cleared and `{ ok: true }` returned; no `session_version` bump, because there is no live session |
| 28 | A signed-in user opens `/sign-in` | Redirected to `homeFor(roles)`; no second OAuth round trip |
| 29 | Mail delivery throws or times out | Registration fails with retryable `503 service_unavailable`; no success is reported without delivery. `MAIL_API_KEY` missing in production is edge case 1b; in development the log adapter is registered automatically with a boot warning, so `npm run dev` never shows a form that always 503s |
| 30 | `AUTH_IDENTITY_ADAPTER=mock` or `MAILER_ADAPTER=log` set without `INTEGRATION_TEST_RUN=1` | The env schema refuses and the app **fails at boot**, loudly — never a silent fallback to the real adapter |
| 30b | A stored `users.roles` is empty despite the `CHECK` | `requireSession` throws an internal error (logged 500), never a 401 — a 401 would loop the user through sign-in and hide a data bug. `Session.roles` is typed `readonly [Role, ...Role[]]` |
| 31 | Database unreachable | Auth routes fail closed; `/api/health` still answers 200 with `database: "down"` |
| 32 | Integration harness: `NODE_ENV=production` over plain-HTTP loopback | A `secure` cookie is accepted only because Chrome treats loopback origins as trustworthy. This is browser behaviour, not something the harness implements — `tests/integration/environment.ts` sets `NODE_ENV: 'production'` and contains no loopback logic. Load-bearing: a harness serving from a non-loopback host would break sign-in in CI, so the harness asserts the cookie was stored |

## 📝 Risks & Impact Review

**Risk level, per slice.** `SDLC.md:95-99` infers the label from what a PR touches, and these four
PRs do not touch the same things:

| Slice | Label | Reasoning | Gate |
|---|---|---|---|
| 1 | `risk-low` + `skip-qa` | devDependencies and `vitest.config.mts`; no production behaviour | validation gate only |
| 2 | `risk-high` | auth, sessions, a schema migration, §1/§2/§7 surfaces | second reviewer, QA reviewer, **no self-QA**, migration up/down test, rollback plan in the body |
| 3 | `risk-medium` | UI chrome and navigation; no auth logic, no schema, no protected surface | self-QA permitted with evidence (`qa-approved` + `qa-self-verified`) |
| 4 | `risk-high` | auth, a schema migration, credential handling | as Slice 2 |

Slice 3's classification depends on one constraint, which its PR body must state: **it must not
modify the guard calls in the three layouts**, only what surrounds them. `SDLC.md` says conflicting
signals take the higher label, so a Slice 3 diff that touches a `requirePageRole` line becomes
`risk-high` and loses the self-QA exception. The `link "Users"` semantic is not a protected surface
(see Breaking changes), so it is not a `risk-high` trigger either.

| Risk | Mitigation |
|---|---|
| A guard is added server-side but the UI is the only real gate | Enforcement is at the page and the service, not the layout; every acceptance criterion has a negative case; Slice 3 ships `roles.integration.test.ts` driving the denied path in a browser |
| A guarded page is added later with a layout-only check | A `CODE_REVIEW.md` checklist line, graded blocker: *a guarded page enforces at the page and service, not only at the layout* — carried into E02–E05 rather than into a spec that will be in `implemented/` |
| Account takeover through email linking | Linking requires a locally verified row (edge case #4); the Slice 2 backfill and the removal of `POST /api/users` empty the vulnerable population rather than only documenting it |
| The `AppShell` port breaks CI's Integration job | The signed-in `admin.integration.test.ts` asserts `link "Users"`; the port keeps it |
| An auth bypass ships in production code as "test mode" | Two required signals, a **boot failure** on the dangerous combination, and a unit test asserting the mock is refused in a production-shaped environment. The port alone would not have achieved this — it fixes the shape of the seam, not its selection |
| The rename (`student` → `mentee`) is missed somewhere | Zero consumers today; `npm run typecheck` is the exhaustive check, and both §2/§7 entries change in the same PR |
| Env vars without defaults break the CI build | All auth vars are `optional()` in the schema and fail closed at the route; the production-only requirement for `SESSION_SECRET` (and `MAIL_API_KEY`) is checked at container creation, never at parse time, so the Build job — which runs `next build` as production with no env — is untouched. `.env.example`, `README.md`, `.github/workflows/ci.yml` and `tests/integration/environment.ts` are updated in the same PR as the var |
| The mail provider is not decided by ship date | Decided: Resend over its HTTP API through `fetchJson` — one call, no SMTP client, B20's timeout and redaction for free. The remaining action is a founder creating the key |
| Secrets leak into logs | pino redaction for `password`, `passwordHash`, `token`, `authorization`, `cookie`; `fetchJson` never logs a request body; asserted by a unit test |
| Session forgery | `jose` HS256 verification with an explicit algorithm allowlist; unit tests for valid, expired, malformed, tampered payload and tampered signature |
| Login is a denial-of-service surface | `scrypt` on the threadpool rather than `bcryptjs` on the main thread; a global concurrency gate bounds memory; the 503 path is excluded from the rate limiter |
| MikroORM v7 cannot express `text[]` cleanly with `p` builders | Spiked before step 8, not during it — the repo has been surprised by this API twice |
| Sandbox `DATABASE_URL` injection targets the wrong database during migration work | Known: `.ai/lessons.md` 2026-09-04. Prefix one-off `db:*` runs and confirm with `migration:list` |

**Rollback.** Each delivery slice is one PR. Every Slice 2 column is additive and either nullable
or defaulted, and pre-auth code ignores all of them — so **the documented rollback is a code revert
with the migration left applied**. No data is deleted, nothing is re-exposed, and rolling forward
again is a no-op. The `down` migration is written and exercised in both directions because §3
requires it, but its use is scoped to CI and pre-launch. `/api/users` does not return to public on
any rollback path: re-exposing account data is a worse outcome than the defect being rolled back.
Slice 4's password column is nullable, so reverting it leaves GitHub accounts working; revert
Slice 4 before Slice 2 if both must go.

**Out of scope.** Password reset (no decision record; a follow-up). Invitation acceptance (#15).
The screens the guards protect — slots, prices, notes, sessions — are E02–E05. Full RBAC beyond the
three fixed roles, configurable permissions, role inheritance, refresh tokens, per-session
revocation, email change, and any social provider other than GitHub (D07) are out of scope.

## 📋 Phasing

Each delivery slice is one PR, independently shippable, leaving the app working. All four land
before the 1.0 ship date (D16: 2026-10-31).

- **Slice 1 — React test infrastructure.** Test dependencies and configuration only. `risk-low`.
- **Slice 2 — GitHub sign-in and data protection (#12).** The session mechanism, multi-role model,
  role homes, page-and-service enforcement, operator guard for the users resource, removal of
  `POST /api/users`, and CSRF enforcement in `apiHandler`. Ships primitives B1, B2, B3
  (`requireSession`, `requireCsrfHeader`, the Cradle registrations), B5 (stateless pair), B6 (503
  + the production-secret check), B7, B10, B14 (GitHub identity port, mock personas via `login`),
  B20, F3, the minimal F4 sign-out action, the ESLint third-party boundary patterns, and the
  harness `signInAs` helper. **This is the unblock point: E02+ may start when it merges.**
- **Slice 3 — Signed-in shell (#12, #14).** F1/F2, `nav.ts`, combined-role navigation, and F7 with
  the R07 negative assertion. Depends on Slice 2. `risk-medium`.
- **Slice 4 — Email and password (#13).** The D07 fallback on the same session. Ships B8 (with
  the `AuthRateLimit` table, the 429 error and `TRUSTED_PROXY_HOPS`), B9, B14 (mailer port, Resend
  and log adapters, `waitForMail`), F5.

Story #14's remaining guard obligations ship per-story with E02–E05, carried by the
`CODE_REVIEW.md` checklist line. There is no Slice 5: E01 has exactly one list endpoint
(`/api/users`, operator-only, unscoped), so there is no scoping pattern for it to establish, and
primitives B4 owns that design for #23.

## 📋 Implementation Plan

Every step leaves the app building and booting. Every step that adds or changes a production file
adds it to `coverage.include` in `vitest.config.mts` **in that step**, and carries unit tests to
100% statements / branches / functions / lines for that file — `AGENTS.md:161-174` makes this the
completion bar, and a file measured only because a test happens to import it does not count.

### Slice 1 — the test toolchain (`risk-low`, `skip-qa`)

The repository has no way to test a React component today: `vitest.config.mts:5` is
`environment: 'node'`, there is no `jsdom`, no `@testing-library/react`, no `@vitejs/plugin-react`,
and no `*.test.tsx` anywhere. The later slices add `.tsx` production files.

1. Add `jsdom`, `@testing-library/react`, `@testing-library/user-event` and `@vitejs/plugin-react`
   as devDependencies; add the React plugin to `vitest.config.mts` and allow per-file
   `// @vitest-environment jsdom`. Node stays the default so existing tests are untouched.
2. **Fix the component-testing approach and write it into `AGENTS.md`:**
   - *Server components* (`page.tsx`, `layout.tsx`) are async functions returning an element tree.
     Test them by **invoking them directly** and asserting on the returned tree — no DOM, no
     renderer, `node` environment.
   - *Client components* (`CrudForm`, `WorkflowAction`, `AppShell`) use Testing Library under jsdom.
   - **Two mocking seams, because guarded pages redirect.** `redirect()` does not return, it throws
     a framework control-flow error, so a denied path yields no tree. Page tests mock
     `app/src/lib/session.ts` and assert the tree on the allowed path and a sentinel throw on the
     denied one. `session.test.ts` mocks `next/navigation` and asserts `redirect` was called with
     the expected URL. Neither test asserts against Next internals.
   - Record the cost honestly: with page-level enforcement, every guarded `page.tsx` is a
     `coverage.include` entry needing both the authorized and the redirected branch.

### Slice 2 — GitHub sign-in and data protection (#12) (`risk-high`)

3. **Clock (B1).** `core/src/time/clock.ts`; register `clock` in `container/container.ts` and
   `container/cradle.ts`. The auth services receive it by constructor injection and read it
   internally; none of their public methods takes a `now` parameter.
   *Test:* `systemClock.now()` returns a `Date`; an injected fixed clock is honoured.
4. **`ServiceUnavailableError` (B6) + `safeReturnTo` (B7) + `fetchJson` (B20).** Add the 503 row to
   `BACKWARD_COMPATIBILITY.md` §1.
   *Test:* `return-to.test.ts` — a relative page path passes; `//host`, `/\host`, `https://…`,
   `/api/anything`, `/_next/anything`, `''` and `undefined` fall back. `errors.test.ts` — status
   503, code `service_unavailable`; the optional `headers` field round-trips through `apiHandler`.
   `outbound.test.ts` — happy path; non-2xx → `ServiceUnavailableError` with the upstream status
   in the cause; an aborting signal → `ServiceUnavailableError`; the request body never reaches
   the logger.
5. **Env (B6).** `core/src/config/env.ts`: `SESSION_SECRET` (`z.string().min(32).optional()`),
   `SESSION_SECRET_PREVIOUS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OPERATOR_EMAILS`
   (default empty), `APP_URL` (default `http://localhost:3000`), `TRUSTED_PROXY_HOPS` (integer
   ≥ 0, default `0`), `AUTH_IDENTITY_ADAPTER`, `INTEGRATION_TEST_RUN`, and — declared now, consumed
   in Slice 4 — `MAILER_ADAPTER`, `MAIL_API_KEY`, `MAIL_FROM`. A `superRefine` **rejects
   `AUTH_IDENTITY_ADAPTER=mock` or `MAILER_ADAPTER=log` without `INTEGRATION_TEST_RUN=1`**,
   failing at boot. Separately, `createContainer` throws when `NODE_ENV=production` and
   `SESSION_SECRET` is unset (from Slice 4: or `MAIL_API_KEY` is unset while `MAILER_ADAPTER` is
   not `log`) — **in the container, not the schema**, because `getEnv()` is reachable from
   `admin/page.tsx` and the logger during `next build`, which CI runs as production with no env.
   Mirror every var in `.env.example`, `README.md`, `.github/workflows/ci.yml` (with a fake
   `OPERATOR_EMAILS`), and `tests/integration/environment.ts` (which now sets `SESSION_SECRET`,
   `AUTH_IDENTITY_ADAPTER=mock`, `INTEGRATION_TEST_RUN=1`, `OPERATOR_EMAILS`).
   *Test:* defaults; a too-short secret rejected; all-absent still parses; each fake-adapter
   combination rejected in a production-shaped env; the container check throws in production
   without the secret and passes in development without it; the memoisation branch. `getEnv` caches in a module-level
   `let` (`env.ts:27-35`), so each case needs `vi.resetModules()` and the cache-hit path needs one
   explicit call to reach 100% branches.
6. **Migration + entity.** Spike the `p`-builder representation of `text[]` first. Then
   `npm run db:migration:create -- --name auth-identity`; add `roles`, `githubId`, `githubLogin`,
   `avatarUrl`, `emailVerifiedAt`, `sessionVersion` to `user.entity.ts`; add the `CHECK` for
   non-empty, non-null, in-union members; **backfill `email_verified_at = now()` for existing
   rows**; hand-write `down`. Seeder: Ada becomes the mentor, add a mentee and an operator (the
   operator also holds `mentor`), all with `emailVerifiedAt` set.
   *Test:* a migration test that runs `up` then `down` then `up` against the Testcontainers database
   and asserts the schema and the backfill each way — required by `SDLC.md:108`. A unit test for the
   seeder's produced rows.
7. **Token service (B5).** Add `jose` — the only runtime dependency E01 adds; implement
   `signPurposeToken` / `verifyPurposeToken` as HS256 JWTs with an explicit algorithm allowlist,
   the purpose in `aud` and enforced on verify, the same `SESSION_SECRET` family, and
   `SESSION_SECRET_PREVIOUS` honoured on verify.
   *Test:* round-trip; wrong purpose (audience) rejected; expired rejected; tampered signature
   rejected; a token signed with the previous secret verifies. Clock injected via the constructor.
8. **Session service (B2).** `issue`, `verify`, `clear`; claims carry identity, session version
   and `aud: 'session'` but no roles; the `Set-Cookie` string is hand-rolled; register in the
   container as a singleton.
   *Test:* issue→verify round-trip; expired; tampered payload; tampered signature; malformed value;
   a purpose token presented as a session is rejected on audience; a token signed with
   `SESSION_SECRET_PREVIOUS` verifies but is never issued; missing `SESSION_SECRET` throws
   `ServiceUnavailableError`; cookie flags asserted (`httpOnly`, `sameSite=lax`, `path=/`,
   `secure` only when `NODE_ENV=production`).
9. **Canonical live session, request scope, and CSRF (B3).** `core/src/http/auth.ts`:
   `Role = 'mentee' | 'mentor' | 'operator'`, `Session.roles: readonly [Role, ...Role[]]`,
   `requireSession(req, cradle)` verifying the cookie, reloading the user, comparing
   `sessionVersion`, returning **stored** roles with `operator` resolved live against
   `OPERATOR_EMAILS`; an empty stored role set is an internal error, not a 401. Add
   `withRequestScope` and the lazily-resolved, fail-closed scoped `session` to
   `container/container.ts` and `cradle.ts`. `requireCsrfHeader` is exported but called only by
   `apiHandler`, which enforces it for every method other than `GET`/`HEAD`/`OPTIONS` and gains
   `apiHandler(logic, { csrf: false })` for the future webhook route. A cookie-only parser may exist
   for diagnostics but is not exported as an authorization API. Update `BACKWARD_COMPATIBILITY.md`
   §2 and §7 (the header is now enforced on every mutating route) in the same commit; add `auth.ts`
   and `apiHandler.ts` to `coverage.include` here.
   *Test:* no cookie; other cookies present; valid; expired; tampered; user absent → 401;
   `sessionVersion` mismatch → 401; stored roles returned; combined roles; empty stored roles →
   internal error; live operator allowlist **removal and addition**; the scoped session resolves
   once per scope; a public route resolving it gets `null` rather than a throw; `requireRole`,
   `requireCsrfHeader`, and `assertOwnership` for all branches; `apiHandler` rejects a POST without
   the header, passes a GET without it, and honours `{ csrf: false }`.
10. **The GitHub identity race.** Handle the transaction and the two relevant unique constraints
    inside `UserService`, where the recovery lookup is known. Do not add a generic `findOrCreate`
    abstraction until a second identical domain use exists.
11. **GitHub identity port + adapters (B14).** `github-identity.port.ts` with
    `authorizeUrl({ state, login? })`, `exchangeCode`, `fetchIdentity`; the real adapter (two
    `fetchJson` calls, no SDK; `login` forwarded to GitHub as its hint parameter), and
    `mock-github-identity.ts`, which derives a stable identity from the `login` hint (default
    `mock-mentee`; email `<login>@devmentor.test`, verified). Register the real adapter by default;
    the mock only under the two-signal rule from step 5.
    *Test:* real adapter with mocked `fetch` — happy path; token-exchange failure; no verified email;
    upstream 5xx; timeout; the hint appears in the authorize URL. Mock adapter: two logins yield two
    stable identities, the same login yields the same identity. A container test asserts the
    selection rule in both directions, and an env test asserts the boot failure.
12. **`findOrCreateFromGithub` + operator reconciliation.** Inside a concept-owned transaction:
    match `githubId` → match a row with `emailVerifiedAt` set → else create with `roles: ['mentee']`
    and `emailVerifiedAt: now`. Never write `users.email` on an existing row. Reconcile only the
    `operator` membership against `OPERATOR_EMAILS`, emitting `auth.user.roles_changed` on any
    change and **not** bumping `sessionVersion`. Add `grantRole` / `revokeRole` (which do bump, and
    re-issue). `UserDto` gains `roles`, `githubLogin`, `avatarUrl`.
    *Test:* each match branch; **an unverified matching row is refused, not linked**; create emits
    `auth.user.created` and the match branches do not; promotion; demotion; an unverified
    allowlisted email is never promoted; mentor membership survives operator promotion and demotion;
    the allowlist is trimmed and case-insensitive; role normalization is order-stable and
    duplicate-free; reconciliation leaves `sessionVersion` untouched; `grantRole` bumps it; the
    concurrent-create race resolves to one row and two successful sign-ins.
13. **Remove `POST /api/users`; guard `GET`.** Delete the `POST` export,
    `validators/auth/user-create.schema.ts`, and its `core/src/index.ts` re-export. Give
    `UserService.create` an explicit typed input rather than spreading into `em.create`. Guard the
    remaining `GET` **twice**: `authorize` on the route and an operator check inside
    `UserService.list`, which now depends on the scoped `session`. Record both §1 and §2 entries.
    *Test:* `list` throws for anonymous, mentee and mentor callers and returns for an operator; the
    route denies before reaching the service; `create` cannot set `roles`.
14. **Routes.** `api/auth/github/route.ts`, `api/auth/github/callback/route.ts`,
    `api/auth/logout/route.ts` — `apiHandler`, `force-dynamic`, the two `GET`s returning redirect
    `Response`s built with `new Response(null, { status: 302, headers })`. The start route validates
    `?login` against `/^[A-Za-z0-9-]{1,39}$/` and forwards it to `authorizeUrl`; the callback compares
    `?state` with the cookie for equality before verifying the token. Logout requires CSRF (via
    `apiHandler`) but not a session.
    *Test:* unconfigured → `?error=unavailable` redirect, not JSON; `access_denied` → cancelled
    redirect with nothing created; a malformed `?login` is dropped, a valid one is forwarded; state
    missing / mismatched / expired, with no outbound call; happy
    path sets the cookie and redirects per role set; combined mentor/operator landing; `returnTo`
    honoured and sanitised; logout clears the cookie and bumps `sessionVersion` **only** when a live
    session exists; logout with an expired cookie still succeeds.
15. **Page guards and sign-out (F3/F4).** `app/src/lib/session.ts` — `getPageSession`,
    `requirePageSession`, `requirePageRole`, `homeFor(roles: readonly [Role, ...Role[]])` — and the
    minimal sign-out `WorkflowAction`, whose `onSuccess` performs a hard `window.location.assign('/')`
    rather than a client-side push. In the same step add the third-party boundary patterns to
    `eslint.config.mjs`: `next`, `next/*`, `react` forbidden in `packages/core/**` and
    `packages/db/**`; `next`, `next/*` forbidden in `packages/ui/**`.
    *Test:* `session.test.ts` with `next/navigation` mocked — no cookie → redirect with `returnTo`;
    wrong role → own home; required role present → session; combined roles; `homeFor` priority. The
    sign-out action under jsdom for pending state, success (hard navigation invoked), and envelope
    errors. `npm run lint` fails on a deliberate `next/headers` import in `core` (verified, then
    reverted, in the PR description).
16. **Minimal pages and integration.** `(auth)/sign-in/page.tsx` (GitHub first, email disabled with
    a note, the `cancelled` / `state` / `unavailable` / `verification` messages, and a redirect for
    an already-signed-in visitor); `(mentee)/layout.tsx` + `home/page.tsx`; `(mentor)/layout.tsx` +
    `mentor/page.tsx`; guard the existing admin layout **and** `admin/page.tsx` and
    `admin/users/page.tsx`, without changing the chrome and preserving an accessible `link "Users"`.
    *Test:* each page invoked directly per step 2. Add `signInAs(login)` to the harness beside
    `adminBrowserSession`. `auth.integration.test.ts` — a cancelled authorisation shows the notice
    and creates nothing; `signInAs('mock-mentee')` lands on the mentee home; signing in as the
    seeded mentor's login lands on the mentor home; `signInAs('mock-operator')` lands on `/admin`;
    an expired session on a signed-in screen redirects and reveals nothing; the harness asserts the
    `secure` cookie was stored. `admin.integration.test.ts` **signs in as `mock-operator` first** —
    it opens `/admin` with no cookie today (`admin.integration.test.ts:16`) and cannot pass unchanged
    once `/admin` is guarded, so it is updated in this PR.
17. **Docs.** `AGENTS.md`: the navigated-vs-fetched route rule, the JSON-only rule for
    state-changing routes, and the component-testing approach. `README.md`: the new variables,
    which ones production requires at boot, and how to create a GitHub OAuth app.
    `BACKWARD_COMPATIBILITY.md`: §1, §2, §7. **`CODE_REVIEW.md`**: replace the stale
    *"`readSession` currently returns `null` by design"* line, and add the page-and-service
    enforcement checklist item, graded blocker. Fix the `uuid v7` docblock in
    `packages/db/src/entities/base.entity.ts` — the ids are v4.

### Slice 3 — signed-in shell and the R07 assertion (#12, #14) (`risk-medium`)

18. **AppShell (F2) and the surface taxonomy (F1).** `ui/src/backend/shell/AppShell.tsx` with `nav`
    as a `ReactNode` slot. Update `AGENTS.md` with the three-surface taxonomy.
    *Test:* `AppShell.test.tsx` under jsdom — chrome, user block, actions, and an arbitrary nav slot.
19. **Navigation and the layout port.** `app/src/lib/nav.ts` builds links from the union of held
    roles; port the three signed-in layouts to `AppShell`. **Do not modify the guard calls** — that
    is what keeps this PR `risk-medium`. Preserve the accessible `link "Users"`.
    *Test:* single-role and combined-role navigation; each layout still guards; the signed-in
    `admin.integration.test.ts` remains green.
20. **Negative-assertion helper (F7) + role integration.** `tests/integration/assertions.ts`
    (`expectAbsent`); `tests/integration/roles.integration.test.ts` — a mentee opening a mentor
    screen is sent home; a mentor opening `/admin` is refused; **no "become a mentor" affordance
    exists in the navigation of any signed-in role** (R07); the operator sees the users list and a
    mentee gets a 403 from `/api/users`.

### Slice 4 — Email and password (#13) (`risk-high`)

21. **Migration + entity.** `auth-password`: `password_hash` (`text`, nullable), with `down` and the
    same up/down migration test as step 6. Seeder: give the mentee and the operator a hash.
22. **Password service (B9).** `node:crypto` `scrypt`, N=2¹⁷/r=8/p=1 as named constants with the
    reason, `maxmem` raised explicitly, behind a global concurrency gate sized by
    `PASSWORD_HASH_CONCURRENCY` with `PASSWORD_HASH_WAIT_MS`. Amend the standards spec's hashing
    bullet in the same PR.
    *Test:* hash ≠ plaintext; verify true/false; a null hash never verifies; parameters below
    `maxmem` throw without the explicit raise (regression); the gate admits up to the limit, queues,
    and throws `ServiceUnavailableError` past the wait.
23. **Rate limiter (B8) and the 429.** Add `TooManyRequestsError` (429, `rate_limited`,
    `retryAfterSeconds`, a `Retry-After` header through `AppError.headers`) and the §1 row. Add the
    `AuthRateLimit` entity — `auth_rate_limits (key text PK, window_start timestamptz, count int)`,
    indexed on `window_start`, the one entity without `baseProperties` — and its migration with
    `down`. Implement `core/src/http/rate-limit.ts` as a scoped `RateLimiter` class taking
    `{ em, clock }`, with `consume(key, policy)` as one raw-SQL `INSERT … ON CONFLICT … RETURNING`
    through `em.execute`, an inline `DELETE` of rows older than the longest window on every call,
    keys of the form `<scope>:<kind>:<sha256(lowercased identifier)>`, the client IP taken
    Nth-from-right from `x-forwarded-for` per `TRUSTED_PROXY_HOPS` (per-IP key skipped, one warning
    per process, when none is derivable), and the policies as named constants: sign-in 10/IP/15 min
    and 5/email/15 min; registration 5/IP/hour; verification resend 3/email/hour. Every attempt
    counts, consumed after the hashing gate slot is acquired and before any credential work.
    *Test:* under the limit passes; at the limit throws a 429 with `retryAfterSeconds`; the window
    rolls over; expired rows are deleted; per-IP and per-email keys are independent; the key holds
    no raw identifier; the forwarded-header parsing for 0, 1 and 2 hops; the no-IP fallback warns
    once; a hashing-gate 503 does not increment a counter (ordering).
24. **Mailer port + adapters (B14).** `mailer.port.ts` (`send({ to, subject, text })`);
    `adapters/resend-mailer.ts` — one `fetchJson` call to Resend's `POST /emails` with the bearer
    key, no SMTP client; `adapters/log-mailer.ts` — one structured pino line per message
    (`msg: 'mail.sent'`, `to`, `subject`, `text`). Selection: `MAILER_ADAPTER=log` +
    `INTEGRATION_TEST_RUN=1` (refused when half-set, step 5); in `development` with
    `MAILER_ADAPTER` unset the log adapter is registered automatically with a boot warning; in
    production `MAIL_API_KEY` is required at container creation (step 5). Delivery failure makes
    registration fail closed with `service_unavailable`. In the harness, add `waitForMail(to)` that
    polls the app log file `global-setup.ts` already pipes stdout into and returns the parsed
    message.
    *Test:* Resend success, non-2xx and timeout (via `fetchJson`'s error); the key and message
    bodies never reach logs; the two-signal rule selects the log adapter; development without a
    key gets the log adapter and a warning; production without a key fails at container creation;
    `waitForMail` parses a captured line and times out cleanly.
25. **Verification service.** `email-verification.service.ts` on `token.service` with purpose
    `email-verify`. Verification sets `emailVerifiedAt` and issues a session.
    *Test:* issue→verify; expired; wrong purpose; **already-verified is idempotent, not an error**;
    the token carries no credential material.
26. **Schemas.** `register.schema.ts`, `login.schema.ts`, including the 72-byte cap.
    *Test:* min and max length, email shape, `returnTo` optional.
27. **Service methods.** `registerWithPassword` implementing the full state matrix above, writing
    `password_hash` immediately; `authenticateWithPassword` (one generic `UnauthorizedError` for both
    unknown email and wrong password; no session before `emailVerifiedAt`).
    *Test:* every row of the matrix; that the two failure messages are byte-identical; that claiming
    an unverified row issues no session until verification.
28. **Routes and pages.** `api/auth/register`, `api/auth/login`, `api/auth/verify-email` —
    rate-limited, CSRF-checked on the two POSTs, `apiHandler`, `force-dynamic`. Then
    `npx shadcn@latest add input label` in `packages/ui`; back `CrudForm`'s renderers with them; add
    the `password` field type (F5); `(auth)/register/page.tsx`; enable the email form on `/sign-in`
    (GitHub stays first). Update `README.md` and `BACKWARD_COMPATIBILITY.md` §1.
    *Test:* happy paths; the generic failure sets no cookie; the rate limit trips; valid verification
    redirects through `safeReturnTo`; invalid and expired tokens redirect to
    `/sign-in?error=verification` rather than rendering a JSON envelope; the rate limit answers 429
    with `Retry-After`. `CrudForm.test.tsx` under jsdom for the `password` type and server
    `fieldErrors` mapping. Integration: a wrong password shows the generic message and sets no
    cookie; a registration completes end-to-end by following the link `waitForMail` captures from
    the log adapter.

## ✅ Acceptance criteria

Carried in intent from #12, #13 and #14, with the naming decision applied.

**Story #12 (delivered by Slices 2–3)**
- A developer authorising DevMentor on GitHub gets an account tied to that GitHub identity and lands
  on the mentee home. (R06, D07)
- A mentor-only GitHub sign-in lands on the mentor home; a mentor/operator lands on `/admin` and can
  navigate to both surfaces. (D07)
- Cancelling the GitHub authorisation creates no account and the sign-in screen says so.
- An expired session on a signed-in screen asks for sign-in again, and nothing of the user's is shown
  before that.
- Every sign-in screen offers GitHub first and email second. (D07)
- A GitHub email matching an unverified local row links nothing and explains why. (security)

**Story #13 (delivered by Slice 4)**
- A user without GitHub registers, confirms their email, and lands on the mentee home. (R06)
- A wrong password fails with a message that does not say which part was wrong, and starts no
  session.
- An email already tied to a GitHub account is refused with a pointer to GitHub sign-in.
- Email/password authentication preserves every stored role; invitation acceptance owns the separate
  acceptance criterion that it adds `mentor` without replacing existing roles. (#15)

**Story #14 (delivered by Slices 2–3, then per-story in E02–E05)**
- A mentee opening a mentor-only screen is refused and sent to their home. (D05)
- A mentor-only user opening an operator screen is refused; a mentor/operator is admitted.
- A revoked operator is refused on their next request, including a client-side navigation within
  `/admin`. (security)
- Founder A and founder B hold the operator role; no account can be given it in 1.0 except by a
  founder editing the allowlist, and every such change is a reviewed commit. (D19, R18)
- A mentee listing users is refused; only the operator may. (authorization)
- A signed-in user looking for a way to become a mentor finds none. (R07)

## 📋 Decisions in play

- **D07 / R06** — GitHub for every role, email plus password as the fallback (founder A)
- **D19 / R18** — the operator is the two founders; by-hand actions logged (both founders)
- **R07 / D08** — mentors join by invitation only; no open registration (founder A)
- **D05** — 1.0 is the session marketplace with accounts and roles (founder A)
- **D16** — 1.0 ships 2026-10-31; all four slices land before it

## 📝 Resolved in this spec

- **Mentee vs `student`** → `mentee`, everywhere, in Slice 2, while `Role` has no production
  consumers.
- **Single vs multiple roles** → a non-empty fixed role set. Mentor and operator membership are
  independent and may coexist on one account; this does not introduce configurable RBAC.
- **Session lifetime** → 24 hours with no refresh flow, as the standards spec's stated known
  limitation — but **with revocation**, via `session_version`, which that spec did not cover, and
  with one logical session per user. Revisit at the 2026-11-28 retrospective (D23).
- **Where operator authority lives** → the allowlist, checked live in both directions; the stored
  role is a cache.
- **Where authorization is enforced** → the page and the service, never the layout alone.
- **Mail transport** → Resend over its HTTP API through `fetchJson`, not SMTP. One call, no
  `nodemailer`, B20's timeout and redaction for free. `SMTP_URL` is retired before it ever existed;
  the keys are `MAIL_API_KEY` and `MAIL_FROM`. What remains is a founder creating the Resend key
  before the Slice 4 deploy — release configuration, no longer a design question.
- **Mock personas** → the `login` hint on `authorizeUrl`, because a fixed mock identity cannot
  coexist with a live operator allowlist.

## 📝 Open questions

- **Combined roles are resolved.** A founder who is also a mentor uses one account holding both
  `mentor` and `operator`; removing the operator allowlist entry leaves `mentor` intact.

## 📝 What the 2026-09-06 revision changed

A design review reworked this spec; the body above is authoritative and this list exists only to
orient a reviewer reading the diff.

- **Shape.** Five slices became four: Slice 5 dissolved into per-story guards plus a
  `CODE_REVIEW.md` line, because E01 has no scoped list to establish a pattern with (primitives B4
  owns that for #23). Per-slice risk labels replace a blanket `risk-high`, which is what makes the
  plan fit the iteration without cutting a D13-committed story.
- **Operator model.** The allowlist is now checked live in both directions and reconciliation no
  longer bumps `session_version` — the previous design revoked instantly but granted only after a
  sign-out/sign-in cycle, and its bump would have ejected the caller from a page that cannot
  re-issue a cookie.
- **Enforcement.** Moved from layouts to pages and services; the session became a request-scoped
  cradle key reached through a new additive `withRequestScope`.
- **Hashing.** `bcryptjs` cost 12 → `node:crypto` `scrypt` with a concurrency gate.
- **Data protection.** `POST /api/users` removed rather than guarded; pre-existing rows backfilled
  as verified rather than left as a documented dead end; the full `registerWithPassword` matrix
  written down.
- **Corrections.** `link "Users"` is not a §7 surface, so the `AppShell` port is not a breaking
  change; the container files live under `src/container/`; edge case #32's loopback behaviour is
  Chrome's, not the harness's; CSRF now covers login and register; logout no longer requires a
  session.

## 📝 What the 2026-09-08 revision changed

The primitives spec was grilled on 2026-09-08 (32 questions) and this spec follows its decisions
wherever the two overlap. The body above is authoritative; this list orients a reviewer.

- **Mail.** SMTP + `SMTP_URL` → Resend over HTTP through `fetchJson`, `MAIL_API_KEY` +
  `MAIL_FROM`; the blocking "which SMTP service" question is closed. The log mailer is the
  development default and is selected in the harness by the same env-pair rule as the GitHub mock;
  `waitForMail` reads the link from the app log the harness already captures.
- **Mock personas.** A fixed identity → a `login` hint on `authorizeUrl`, forwarded by the start
  route and used by the mock to derive its identity; `signInAs(login)` in the harness; seeded
  addresses follow `<login>@devmentor.test`.
- **Config gate.** `SESSION_SECRET` (and `MAIL_API_KEY`) are required in production at container
  creation, deliberately outside the zod schema so `next build` in CI still passes; `MAILER_ADAPTER`
  joins the refuse-when-half-set rule; `TRUSTED_PROXY_HOPS` added.
- **CSRF.** Enforced by `apiHandler` on every non-`GET` route with `{ csrf: false }` reserved for
  the webhook; state-changing routes are JSON-only by rule.
- **Tokens.** Every JWT carries an `aud` (`session` or the purpose) and every verifier names one;
  `SESSION_SECRET_PREVIOUS` verifies purpose tokens too; the cookie string is hand-rolled; the
  clock is injected by constructor.
- **Rate limiting.** The contract is now concrete: `AuthRateLimit` with a natural PK, hashed keys,
  inline expiry, a 429 with `Retry-After`, the policy numbers, and the gate → limiter → hash
  ordering that keeps edge case 18 true.
- **Guards.** `Session.roles` is a non-empty tuple; an empty stored set is an internal error;
  sign-out ends in a hard navigation; `safeReturnTo` also rejects `/api/` and `/_next/`.
- **Boundaries.** The ESLint third-party patterns (`next`, `react`) land in Slice 2; until then
  the `core ↛ next` rule is a convention, which the architecture section now says.

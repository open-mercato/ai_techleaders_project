# DevMentor — Accounts and Roles (E01)

Date: 2026-09-04
Status: active
Tracker: epic #7 — stories #12 (E01-S01), #13 (E01-S02), #14 (E01-S03)
Design authority: `.ai/specs/product-brief.md` (D07, D19, R06, R07, R18)
Primitives: `.ai/specs/2026-09-04-platform-primitives.md` — the design authority for every
mechanism this spec *uses*; referenced rather than restated
Standards: `.ai/specs/2026-09-01-engineering-standards.md` (Security & Validation)

## 📝 TLDR

Nothing in DevMentor knows who anyone is. `readSession` in `packages/core/src/http/auth.ts`
returns `null` for every request, `User` has no role and no credential, and `/api/users` is
public. This spec gives the three roles the brief names — mentee, mentor, operator — a way to
sign in and a guarantee that each reaches only its own screens. GitHub is the first method
(D07: *"my GitHub is my profile"*), email and password the fallback, and the operator role
belongs to the two founders by an allowlist that no screen in the product can grant.

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
| `readSession` returns `null` unconditionally, even when the cookie is present | `packages/core/src/http/auth.ts:22-31` |
| `Role = 'student' \| 'mentor'` — no operator, and a name no product document uses | `packages/core/src/http/auth.ts:13` |
| `User` has `email`, `displayName`, `mentorProfile` — no role, no credential, no GitHub id | `packages/db/src/entities/auth/user.entity.ts` |
| `/api/users` is public — GET **and POST** — *"until the auth concept lands"* | `packages/app/src/app/api/users/route.ts:15-18` |
| `apiCall` sends `x-devmentor-request`; **nothing server-side checks it** | `packages/ui/src/backend/api/apiCall.ts` |
| No env var for any secret; no `(auth)` route group; no sign-in page | `core/src/config/env.ts`, `packages/app/src/app` |
| No React test toolchain: `vitest.config.mts:5` is `environment: 'node'`, no jsdom, no `*.test.tsx` | `vitest.config.mts` |

## 📝 Proposed Solution

Three phases, one per story, each independently shippable and each leaving the app working.

1. **GitHub sign-in (#12)** — the session mechanism, the real `readSession`, the role homes.
   Everything after this reuses the session; nothing after this re-implements it.
2. **Email and password (#13)** — the D07 fallback, on the *same* session, with verification,
   rate limiting and generic auth errors.
3. **Roles and scoping (#14)** — the `operator` role, guards on every non-public route and page,
   CSRF enforcement, and the scoping pattern every later list copies.

### Decided here, before any consumer exists

**`student` → `mentee`.** The brief, all 28 issues and the glossary say *mentee*; only the code
says `student`. `Role` is a `BACKWARD_COMPATIBILITY.md` §2/§7 surface, so renaming it is a
breaking change — but it has **zero consumers**: the only references are its declaration and
use inside `core/src/http/auth.ts` and the barrel re-export. That makes this the cheapest moment
it will ever be. `Role = 'mentee' | 'mentor' | 'operator'`; the route group is `(mentee)/`; later
services read `listForMentee` / `listForMentor` exactly as #23 already writes them.

**Role is a stored column, and the stored value always wins.** #14 proposes that
`session.service.ts` issue `role: 'operator'` for an allowlisted email. Taken literally that
gives two sources of truth — a `role` column on `users` (#12) and a derived role in the token —
which will disagree the first time a query filters on `user.role`. Instead:

> `users.role` is the single source of truth. At **every** sign-in the service reconciles it
> against `OPERATOR_EMAILS`: an allowlisted, locally verified email is promoted to `operator`;
> a stored `operator` no longer allowlisted is demoted. Every role change bumps
> `users.session_version` and emits `auth.user.role_changed`. Guarded requests read the role
> from the row via `requireLiveSession`, so the token's copy is a hint, never an authority.

That closes both the two-sources problem and the revocation lag: a demotion takes effect on the
demoted user's very next guarded request, not up to 24 hours later. It also satisfies R18 —
the role change is a logged, emitted event rather than a silent mutation.

**No product path grants a role.** R07 and D19 both require it, and #14 makes it an acceptance
criterion in the negative: a signed-in user looking for a "become a mentor" path must find none.
The mentor role is granted only by accepting an invitation (#15); the operator role only by the
allowlist.

**Account linking requires local verification.** Matching a GitHub identity to an existing row
by email alone is an account-takeover vector, because until Phase 3 `POST /api/users` is public
and anyone can create a row for any address. The rule:

> A GitHub identity links to an existing `users` row **only when that row's own
> `email_verified_at` is set**. Otherwise the sign-in is refused with an explanation, and
> nothing is linked or created.

This is why `email_verified_at` is in the **Phase 1** migration even though nothing writes it
until Phase 2 for password accounts: GitHub sign-in sets it when GitHub reports the primary
email as verified, and rows created by the still-public `POST /api/users` never have it. Auth.js
refuses the same case by default (`OAuthAccountNotLinked`); the reasoning is identical.

### Alternatives considered

- **Auth.js / NextAuth.** Rejected — the structural reasons, and the five things the library
  gets right that this spec adopts anyway, are in the primitives spec ("What we build instead of
  buying"). Summary: it owns `/api/auth/[...nextauth]` as a catch-all and would break the §1
  envelope; its `useSession` model is a client-side session fetch that contradicts #12's
  *"nothing of the user's is rendered first"*; its DB adapter puts a vendor between `core` and
  `db`.
- **Derive `operator` in the token only** (as #14 reads). Rejected above — two sources of truth.
- **A pure stateless session with no revocation.** Rejected — see the primitives spec B2; a
  copied cookie would survive sign-out for 24 hours.
- **Password reset in scope.** Rejected: not in the brief, no decision record. A follow-up.

## 📝 Architecture

New and changed files, by package. `†` marks a platform primitive delivered here — see the
primitives spec for its interface and rationale.

```
packages/db/src/entities/auth/user.entity.ts       + role, githubId, githubLogin, avatarUrl,
                                                     emailVerifiedAt, sessionVersion   (Phase 1)
                                                   + passwordHash                       (Phase 2)
packages/db/migrations/…-auth-identity.ts          Phase 1 (up + down)
packages/db/migrations/…-auth-password.ts          Phase 2 (up + down)
packages/db/src/seeders/database.seeder.ts         + a mentee, a mentor, an operator

packages/core/src/
  time/clock.ts                                    † B1
  persistence/transaction.ts                       † B10  withTransaction + findOrCreate
  http/outbound.ts                                 † B20  fetchJson with a timeout
  config/env.ts                                    + SESSION_SECRET(+_PREVIOUS), GITHUB_*,
                                                     APP_URL, OPERATOR_EMAILS, MAIL_FROM
  http/errors.ts                                   † B6   ServiceUnavailableError (503)
  http/auth.ts                                     † B3   real readSession, requireLiveSession,
                                                     requireCsrfHeader, Role widened+renamed
  http/return-to.ts                                † B7
  http/rate-limit.ts                               † B8
  services/auth/session.service.ts                 † B2
  services/auth/token.service.ts                   † B5   stateless pair only
  services/auth/password.service.ts                † B9
  services/auth/github-identity.port.ts            † B14
  services/auth/adapters/github-identity.ts        † B14  two fetch calls, no SDK
  services/auth/adapters/mock-github-identity.ts   † B14  selected when GITHUB_CLIENT_ID is unset
  services/auth/email-verification.service.ts      Phase 2
  services/auth/user.service.ts                    + findOrCreateFromGithub,
                                                     registerWithPassword, authenticateWithPassword
  services/notifications/mailer.port.ts            † B14
  services/notifications/adapters/log-mailer.ts    † B14
  validators/auth/{register,login}.schema.ts       shared client/server
  events/event-map.ts                              + auth.user.role_changed

packages/ui/src/backend/
  shell/AppShell.tsx                               † F2   nav is a ReactNode slot
  actions/WorkflowAction.tsx                       † F4
  forms/CrudForm.tsx                               † F5   shadcn input/label, `password` type

packages/app/src/
  lib/session.ts                                   † F3
  lib/nav.ts                                       per-persona nav (uses next/link)
  app/(auth)/sign-in/page.tsx                      GitHub first, email second
  app/(auth)/register/page.tsx                     Phase 2
  app/(mentee)/layout.tsx  home/page.tsx
  app/(mentor)/layout.tsx  mentor/page.tsx
  app/admin/layout.tsx                             + operator guard, uses AppShell
  app/api/auth/github/route.ts                     GET  → GitHub, sets `state`
  app/api/auth/github/callback/route.ts            GET  → exchange, session, role home
  app/api/auth/{register,login,verify-email}/…     Phase 2
  app/api/auth/logout/route.ts                     POST
  app/api/users/route.ts                           + authorize → operator only (Phase 3)
```

Three boundary facts this layout enforces, all from `eslint.config.mjs` and the package manifests:

- `core/src/http/auth.ts` takes a plain `Request` and never imports `next`. The `next/headers`
  cookie read and every `redirect()` live in `packages/app/src/lib/session.ts`.
- `ui` cannot see `Role`, so `AppShell` takes no persona. It also has **no `next` dependency**,
  so it cannot render `next/link` — `nav` is a rendered `ReactNode` slot, built in
  `app/src/lib/nav.ts` by each layout.
- `app/src/lib/session.ts` does **not** call `readSession`: that takes a `Request`, and
  `cookies()` yields a cookie store. It reads the cookie value and calls
  `sessionService.verify()` then `requireLiveSession()` inside `withScope`. `readSession` keeps
  its exported signature (a §2 surface) as the route-side entry point.

### Session mechanism

Defined in the primitives spec B2 and not restated here. What E01 relies on: cookie
`devmentor_session` (name preserved, §7), stateless HMAC-SHA256 token with a `sv` claim,
24 h, `httpOnly` / `secure` in production / `sameSite=lax` / `path=/`, revocation via
`users.session_version`, and `SESSION_SECRET_PREVIOUS` for rotation.

### GitHub OAuth flow

```
GET /api/auth/github                                    [browser-navigated: failures redirect]
    ├─ SESSION_SECRET or GitHub credentials missing → 302 /sign-in?error=unavailable
    ├─ state = signPurposeToken({ purpose:'oauth-state',
    │                            subject: safeReturnTo(?returnTo, '') })
    ├─ Set-Cookie devmentor_oauth_state  (httpOnly, secure in prod, SameSite=Lax, 10 min)
    └─ 302 → identity.authorizeUrl(state)

GET /api/auth/github/callback                           [browser-navigated: failures redirect]
    ├─ ?error=access_denied → 302 /sign-in?cancelled=1        [nothing created]
    ├─ state cookie missing / mismatched / expired → 302 /sign-in?error=state
    ├─ identity.exchangeCode(code)                            [fetchJson, 10s timeout]
    ├─ identity.fetchIdentity(token) → primary *verified* email required
    ├─ withScope → findOrCreate:
    │     match githubId
    │     → else match email WHERE email_verified_at IS NOT NULL  (link the id)
    │     → else create { role:'mentee', emailVerifiedAt: now }
    │     reconcile OPERATOR_EMAILS; emit auth.user.created / auth.user.role_changed
    ├─ new Response(null, { status: 302, headers })            [Set-Cookie + Location]
    └─ → safeReturnTo(state.subject, homeFor(user.role))
```

Two details that are easy to get wrong and are therefore fixed here:

- **The state cookie is `SameSite=Lax`, never `Strict`.** The callback is a cross-site
  top-level navigation from `github.com`; a `Strict` cookie is not sent, so every sign-in would
  fail with `?error=state`. The standards spec's *"or `strict` for auth-only routes"* does not
  apply to an OAuth state cookie.
- **`Response.redirect()` cannot carry `Set-Cookie`.** The callback builds
  `new Response(null, { status: 302, headers: { location, 'set-cookie': … } })`.

## 📝 Data Model

One table changes, across two additive migrations. Both ship `up` **and** `down` (§3).

`users` — Phase 1 (`auth-identity`):

| Column | Type | Notes |
|---|---|---|
| `role` | `varchar(16)` not null default `'mentee'` | `mentee` \| `mentor` \| `operator` |
| `github_id` | `varchar(64)` null, **unique** | GitHub's numeric id as text |
| `github_login` | `varchar(64)` null | display only |
| `avatar_url` | `text` null | |
| `email_verified_at` | `timestamptz` null | **Phase 1**, not Phase 2 — it gates account linking |
| `session_version` | `integer` not null default `0` | bumped to revoke every session for that user |

`users` — Phase 2 (`auth-password`):

| Column | Type | Notes |
|---|---|---|
| `password_hash` | `varchar(60)` null | bcrypt output is 60 chars; null for GitHub-only accounts |

`email` stays unique — it is the link key between a password account and a GitHub identity, and
the linking rule above is what makes that safe. A row with `github_id` set and `password_hash`
null is GitHub-only; registering that email with a password is refused with a 409.

**Sensitive data.** `password_hash` and the session secret never leave the server, never appear
in a DTO, and are redacted in the pino config. `UserDto` gains `role`, `githubLogin` and
`avatarUrl`; it never gains `passwordHash`, `emailVerifiedAt`, `sessionVersion` or `githubId`.
The entity is defined with `defineEntity` + `p` builders inside `defineSingletonEntity`, per the
MikroORM v7 lesson.

**Seeder.** Ada Lovelace keeps her row and headline (`admin.integration.test.ts` asserts on
them) and becomes the mentor. Two rows are added: a mentee and an operator, both with
`email_verified_at` set, and from Phase 2 a password hash so the harness can sign in through the
form.

## 📝 API Contracts

All routes `export const dynamic = 'force-dynamic'` and are wrapped in `apiHandler`. The two
OAuth `GET`s are **browser-navigated**, so they catch their own failures and return a redirect
`Response`, which `apiHandler` passes through unchanged — a user clicking "Sign in with GitHub"
never sees a JSON envelope rendered as a page.

| Route | Method | Auth | Body / query | Answer |
|---|---|---|---|---|
| `/api/auth/github` | GET | public | `?returnTo` | 302 to GitHub, or 302 `/sign-in?error=unavailable` |
| `/api/auth/github/callback` | GET | public | `?code&state` / `?error` | 302 + `Set-Cookie`, or 302 to `/sign-in?error=…` |
| `/api/auth/register` | POST | public, rate-limited | `registerSchema` | `{ ok: true, data: { email } }` |
| `/api/auth/login` | POST | public, rate-limited | `loginSchema` | `{ ok: true, data: UserDto }` + cookie |
| `/api/auth/verify-email` | GET | public | `?token` | 302 to `returnTo` or the role home |
| `/api/auth/logout` | POST | session + CSRF | — | `{ ok: true, data: null }` + expiring cookie; bumps `session_version` |
| `/api/users` | GET/POST | **operator only** (Phase 3) | unchanged | unchanged shape |

Shared schemas in `core/src/validators/auth/`, imported by both the route and `CrudForm`:

```ts
registerSchema = { email: z.string().email(),
                   password: z.string().min(12),
                   displayName: z.string().min(1).max(120),
                   returnTo: z.string().optional() }     // re-validated by safeReturnTo
loginSchema    = { email, password, returnTo? }
```

**Error codes** — all existing except one addition: `401 unauthorized` for a failed sign-in
(*"Invalid credentials"*, generic for unknown email and wrong password alike), `403 forbidden`
for a wrong role or a missing CSRF header, `409 conflict` for an email already tied to a GitHub
account, `422 validation_failed` with `fieldErrors`, and the new **`503 service_unavailable`**
when an auth secret is unset.

### A deliberate deviation from the standards spec

The standards spec requires auth errors to be *"generic on login/register … never revealing
whether a given email is registered"*. The 409 on `registerWithPassword` for a GitHub-tied
email (#13's acceptance criterion, *"the product refuses and points to GitHub sign-in"*) is a
precise oracle for "this address has a GitHub account here". Recorded as a deliberate trade:
the alternative is a user who cannot sign in and is told nothing. **Login stays strictly
generic** — the account-existence oracle is limited to the register path, which is rate-limited
per IP and per email. Revisit at the 2026-11-28 retrospective.

### Breaking changes

1. **`Role` renamed and widened** (§2, §7): `'student' | 'mentor'` → `'mentee' | 'mentor' |
   'operator'`. No consumer exists; the export and both compatibility entries change together.
2. **`/api/users` stops being public** (§1). Its only caller, `admin/users/page.tsx`, moves under
   the operator-guarded layout, and `tests/integration/admin.integration.test.ts` signs in first
   — all in the Phase 3 PR, listed under "Breaking changes" in the PR body.
3. **`x-devmentor-request` becomes required** on state-changing routes. `apiCall` already sends
   it and is the only sanctioned fetch site, so the in-repo blast radius is zero.
4. **`admin/layout.tsx`'s chrome is replaced by `AppShell`** (§7 names `link "Users"` as an
   asserted semantic; `tests/integration/admin.integration.test.ts:22` asserts it). The port
   preserves an accessible `link "Users"` — verified by that test, unchanged.

Additive: every new route, the 503 code, the `UserDto` fields, the `Cradle` keys, the
`auth.user.role_changed` event (§6), and every column.

**Not** in scope and explicitly deferred: threading a `Session` into `makeCrudRoute`'s `resolve`
(a §2 change to `MakeCrudRouteOptions` / `CrudService`). #23 designs it; E01 uses `authorize`
with `requireRole`, which needs no contract change.

## 📝 UI/UX

Per the three-surface taxonomy (primitives F1): `(auth)` pages are public Tailwind; `(mentee)`,
`(mentor)` and `admin` are shadcn inside `AppShell`.

**`/sign-in`** — "Sign in with GitHub" is the primary action, above the email form (D07 fixes
the order, and #12 makes it an acceptance criterion). Four states it must render:
`?cancelled=1` → *"Sign-in was cancelled. No account was created."*; `?error=state` → a plain
retry; `?error=unavailable` → *"GitHub sign-in is not configured yet."*; and, until Phase 2
ships, the email form disabled with a one-line note.

**Role homes** — `homeFor(role)` is the single place this mapping is decided:
`mentee → /home`, `mentor → /mentor`, `operator → /admin`. The asymmetry (`/home` vs `/mentor`)
is deliberate: #12 names `/home`, and #15 and #17 already write `/mentor` and `/mentor/slots`.

**Guards** — `(mentee)/layout.tsx`, `(mentor)/layout.tsx` and `admin/layout.tsx` each call
`requirePageRole(...)` before rendering anything. A missing session redirects to
`/sign-in?returnTo=<current>`; a wrong role redirects to the caller's own home. Nothing of the
user's renders before the check (#12).

**Navigation** — `app/src/lib/nav.ts` builds each persona's `<Link>` list, passed to `AppShell`
as the `nav` slot. There is no "become a mentor" link and no route that would grant the role
(R07); Phase 3 asserts its absence with `expectAbsent`.

**Sign out** — the first `WorkflowAction`: POST `/api/auth/logout` through `apiCall` (so the
CSRF header rides along), then redirect to `/`.

**Accessibility** — the sign-in form has labelled fields (shadcn `label`), the cancelled and
error notices use the existing `ErrorMessage` (`role="alert"`), and the integration scenarios
assert on semantic roles rather than CSS, per `AGENTS.md`.

## 📝 Edge Cases & Failure Scenarios

| # | Scenario | Behaviour |
|---|---|---|
| 1 | `SESSION_SECRET` / GitHub credentials unset | 302 `/sign-in?error=unavailable`; the app builds, boots and serves public pages. Never a boot failure, never a JSON envelope in the browser |
| 2 | User cancels GitHub authorisation | 302 `/sign-in?cancelled=1`; **no account created**; the screen says so |
| 3 | GitHub account has no *verified* primary email | Refused with the reason; no account created |
| 4 | GitHub email matches a row whose `email_verified_at` is **null** | **Refused, nothing linked** — the row may have been created by anyone through the still-public `POST /api/users`. The user is told to verify that address first |
| 5 | GitHub email matches a locally verified row | The `github_id` is linked to it; one account, not two |
| 6 | OAuth `state` missing, tampered or expired | 302 `/sign-in?error=state`; no token exchange attempted |
| 7 | GitHub is slow or hangs | `fetchJson`'s 10 s `AbortSignal.timeout` → 302 `/sign-in?error=unavailable`; the route never hangs |
| 8 | GitHub returns 5xx | Same as above; nothing is created |
| 9 | Two concurrent callbacks for a new user | `findOrCreate` re-reads after the unique violation; **both callers are signed in**, no 409 for a double-click |
| 10 | Session cookie tampered or expired | `verify` → `null` → redirect to `/sign-in`; nothing of the user's rendered first |
| 11 | A signed-out user's cookie was copied | `session_version` was bumped at sign-out; the copy fails on its next guarded request |
| 12 | `SESSION_SECRET` rotated | `SESSION_SECRET_PREVIOUS` keeps live sessions valid for their remaining lifetime |
| 13 | Wrong password / unknown email | Identical generic 401 *"Invalid credentials"*; no session; the attempt is counted |
| 14 | Registering an email already tied to a GitHub account | 409 pointing to GitHub sign-in (deviation recorded above) |
| 15 | Sign-in before email verification | Refused with the reason; no session issued |
| 16 | Verification link reused, expired, or prefetched by a mail scanner | Already-verified is **idempotent, not an error**, so a scanner consuming the link does not break the user |
| 17 | Rate limit exceeded on login/register | Cooldown with a generic message; a process restart resets counters (documented limitation) |
| 18 | Mentee opens a mentor screen | Redirected to `/home` (403 on the API equivalent) |
| 19 | Mentor opens `/admin` | Refused |
| 20 | `returnTo=//evil.example` or `returnTo=https://…` | Rejected by `safeReturnTo`; falls back to the role home |
| 21 | State-changing POST without `x-devmentor-request` | 403 — a plain HTML form post cannot forge it |
| 22 | Operator email removed from the allowlist | Demoted at next sign-in, `session_version` bumped, `auth.user.role_changed` emitted and logged (R18) |
| 23 | Mail transport throws (Phase 2) | Logged and swallowed; registration still succeeds and the user can re-request verification |
| 24 | Database unreachable | Auth routes fail closed; `/api/health` still answers 200 with `database: "down"` |
| 25 | Integration harness: `NODE_ENV=production` over plain-HTTP loopback | A `secure` cookie is accepted only because Chrome trusts loopback origins (`tests/integration/environment.ts:9`). Load-bearing — a harness serving from a non-loopback host would break sign-in in CI |

## 📝 Risks & Impact Review

**Risk level: high** on all three stories (auth, role grants, a breaking route change). Per
`SDLC.md:103-125` each PR carries `risk-high` + `needs-qa`, **a second person's review**, and
**no self-QA**; the schema PRs additionally carry a migration up/down test.

| Risk | Mitigation |
|---|---|
| A guard is added server-side but the UI is the only real gate | Every acceptance criterion has a negative case; Phase 3 ships `roles.integration.test.ts` driving the denied path in a browser |
| Account takeover through email linking | Linking requires a locally verified row (edge case #4); `email_verified_at` ships in Phase 1 for exactly this reason |
| The `AppShell` port breaks CI's Integration job | `admin.integration.test.ts:22` asserts `link "Users"`; the port keeps it, and that test is the regression check |
| An auth bypass ships in production code as "test mode" | Avoided: the mock identity is an **adapter selected in `container.ts`** when `GITHUB_CLIENT_ID` is unset, not a branch inside a route |
| The rename (`student` → `mentee`) is missed somewhere | Zero consumers today; `npm run typecheck` is the exhaustive check, and both §2/§7 entries change in the same PR |
| Env vars without defaults break the CI build | All auth vars are `optional()` and fail closed at the route; `.env.example`, `README.md`, `.github/workflows/ci.yml` and `tests/integration/environment.ts` are updated in the same PR as the var |
| Secrets leak into logs | pino redaction for `password`, `passwordHash`, `token`, `authorization`, `cookie`; `fetchJson` never logs a request body; asserted by a unit test |
| Session forgery | HMAC-SHA256 + `timingSafeEqual`; unit tests for valid, expired, tampered payload and tampered signature |
| Sandbox `DATABASE_URL` injection targets the wrong database during migration work | Known: `.ai/lessons.md` 2026-09-04. Prefix one-off `db:*` runs and confirm with `migration:list` |

**Rollback.** Each phase is one PR. Reverting Phase 1 returns `readSession` to its stub and
every guarded route to denying — the current behaviour exactly. Migrations ship `down`;
reverting Phase 3 restores `/api/users` to public. Phase 2's column is nullable, so a Phase 2
revert leaves Phase 1 accounts working. **Reverting Phase 1 after Phase 2 has migrated is not
supported** — revert Phase 2 first, then Phase 1, in that order; the PR bodies say so.

**Out of scope.** Password reset (no decision record; a follow-up). Invitation acceptance (#15).
The screens the guards protect — slots, prices, notes, sessions — are E02–E05. RBAC beyond three
roles, refresh tokens, and any social provider other than GitHub (D07).

## 📋 Phasing

Each phase is one PR, independently shippable, leaving the app working.

- **Phase 1 — GitHub sign-in (#12).** The session mechanism and the role homes. Ships primitives
  B1, B2, B3 (`readSession`, `requireLiveSession`), B5 (stateless pair), B6, B7, B10, B14
  (GitHub identity port), B20, F1, F2, F3, F4.
- **Phase 2 — Email and password (#13).** The D07 fallback on the same session. Ships B8, B9,
  B14 (mailer port), F5.
- **Phase 3 — Roles and scoping (#14).** The operator role, guards everywhere, CSRF, and the
  negative-assertion helper. Ships B3 (`requireCsrfHeader`), F7.

## 📋 Implementation Plan

Every step leaves the app building and booting. Every step that adds or changes a production
file adds it to `coverage.include` in `vitest.config.mts` **in that step**, and carries unit
tests to 100% statements / branches / functions / lines for that file — `AGENTS.md:161-174`
makes this the completion bar, and a file measured only because a test happens to import it does
not count.

### Phase 0 — the test toolchain (prerequisite, same PR as Phase 1)

The repository has no way to test a React component today: `vitest.config.mts:5` is
`environment: 'node'`, there is no `jsdom`, no `@testing-library/react`, no
`@vitejs/plugin-react`, and no `*.test.tsx` anywhere. Phase 1 adds fourteen `.tsx` production
files. Without this step the plan stalls at step 13.

0a. Add `jsdom`, `@testing-library/react`, `@testing-library/user-event` and
   `@vitejs/plugin-react` as devDependencies; add the React plugin to `vitest.config.mts` and
   allow per-file `// @vitest-environment jsdom`. Node stays the default so existing tests are
   untouched.
0b. **Fix the testing approach for the two component kinds, and write it into `AGENTS.md`:**
   - *Server components* (`page.tsx`, `layout.tsx`) are async functions returning an element
     tree. They are tested by **invoking them directly** and asserting on the returned tree —
     no DOM, no renderer. Data access is mocked at the `app/src/lib/session.ts` seam.
   - *Client components* (`CrudForm`, `WorkflowAction`, `AppShell`) are tested with Testing
     Library under `jsdom`.
   This is what makes 100%-per-file achievable for pages instead of forcing an exclusion —
   which `AGENTS.md` forbids.

### Phase 1 — GitHub sign-in (#12)

1. **Clock (B1).** `core/src/time/clock.ts`; register `clock` in `container.ts` / `cradle.ts`.
   *Test:* `systemClock.now()` returns a `Date`; an injected fixed clock is honoured.
2. **`ServiceUnavailableError` (B6) + `safeReturnTo` (B7) + `fetchJson` (B20).**
   Add the 503 row to `BACKWARD_COMPATIBILITY.md` §1.
   *Test:* `return-to.test.ts` — a relative path passes; `//host`, `/\host`, `https://…`, `''`
   and `undefined` fall back. `errors.test.ts` — status 503, code `service_unavailable`.
   `outbound.test.ts` — happy path; non-2xx → typed error; an aborting signal → typed error; the
   request body never reaches the logger.
3. **Env (B6).** `core/src/config/env.ts`: `SESSION_SECRET` (`z.string().min(32).optional()`),
   `SESSION_SECRET_PREVIOUS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (optional), `APP_URL`
   (default `http://localhost:3000`). Mirror in `.env.example`, `README.md`,
   `.github/workflows/ci.yml`, `tests/integration/environment.ts`.
   *Test:* defaults; a too-short secret rejected; all-absent still parses; the memoisation
   branch. `getEnv` caches in a module-level `let` (`env.ts:27-35`), so each case needs
   `vi.resetModules()` and the cache-hit path needs one explicit call to reach 100% branches.
4. **Migration + entity.** `npm run db:migration:create -- --name auth-identity`; add `role`,
   `githubId`, `githubLogin`, `avatarUrl`, `emailVerifiedAt`, `sessionVersion` to
   `user.entity.ts` with `p.*` builders; hand-write `down`. Seeder: Ada becomes the mentor, add
   a mentee and an operator, all with `emailVerifiedAt` set.
   *Test:* a migration test that runs `up` then `down` then `up` against the Testcontainers
   database and asserts the schema each way — required by `SDLC.md:108` for a `risk-high` schema
   change. A unit test for the seeder's produced rows, per `AGENTS.md:172-174` (integration
   coverage supplements, never replaces).
5. **Token service (B5).** `signPurposeToken` / `verifyPurposeToken` only.
   *Test:* round-trip; wrong purpose rejected; expired rejected; tampered signature rejected.
   Clock injected.
6. **Session service (B2).** `issue`, `verify`, `clear`; register in `container.ts` / `cradle.ts`.
   *Test:* issue→verify round-trip; expired; tampered payload; tampered signature; malformed
   value; a token signed with `SESSION_SECRET_PREVIOUS` verifies but is never issued; missing
   `SESSION_SECRET` throws `ServiceUnavailableError`; cookie flags asserted (`httpOnly`,
   `sameSite=lax`, `secure` only when `NODE_ENV=production`).
7. **`readSession` + `requireLiveSession` (B3), and the `Role` rename.**
   `core/src/http/auth.ts`: `Role = 'mentee' | 'mentor' | 'operator'`; a real `readSession` that
   parses the `devmentor_session` cookie, delegates to `verify`, and returns `null` on anything
   unexpected; `requireLiveSession(cradle, claims)` that re-reads the user, compares
   `sessionVersion`, and returns the **stored** role. Update `BACKWARD_COMPATIBILITY.md` §2 and
   §7 in the same commit; add `auth.ts` to `coverage.include` here — this is the step where it
   gains tests, so the rename cannot be split out ahead of it.
   *Test:* no cookie; other cookies present; valid; expired; tampered; user absent → 401;
   `sessionVersion` mismatch → 401; the stored role overrides the token's claim; `requireRole`
   and `assertOwnership` for all branches.
8. **Transaction + findOrCreate (B10).** `core/src/persistence/transaction.ts`.
   *Test:* passthrough result; `23505` mapped to `ConflictError`; other errors rethrown
   unchanged; `findOrCreate` returns the existing row, creates when absent, and on `23505`
   re-reads and returns the winner.
9. **GitHub identity port + adapters (B14).** `github-identity.port.ts`, the real adapter (two
   `fetchJson` calls, no SDK), and `mock-github-identity.ts`. Register in `container.ts` with
   the real adapter selected only when `GITHUB_CLIENT_ID` is set.
   *Test:* real adapter with mocked `fetch` — happy path; token-exchange failure; no verified
   email; upstream 5xx; timeout. Mock adapter returns its fixed identity. A container test
   asserts the selection rule in both directions.
10. **`findOrCreateFromGithub` + operator reconciliation.** In `user.service.ts`, inside
    `withScope` and `findOrCreate`: match `githubId` → match a row with `emailVerifiedAt` set →
    else create with `role: 'mentee'` and `emailVerifiedAt: now`. Reconcile against
    `OPERATOR_EMAILS` (added to `env.ts` here, default empty), bumping `sessionVersion` and
    emitting `auth.user.role_changed` on any change. `UserDto` gains `role`, `githubLogin`,
    `avatarUrl`.
    *Test:* each match branch; **an unverified matching row is refused, not linked**; create
    emits `auth.user.created` and the match branches do not; promotion; demotion; an unverified
    allowlisted email is never promoted; the allowlist is trimmed and case-insensitive; the
    concurrent-create race resolves to one row and two successful sign-ins.
11. **Routes.** `api/auth/github/route.ts`, `api/auth/github/callback/route.ts`,
    `api/auth/logout/route.ts` — `apiHandler`, `force-dynamic`, the two `GET`s returning
    redirect `Response`s built with `new Response(null, { status: 302, headers })` because
    `Response.redirect()` cannot carry `Set-Cookie`.
    *Test:* unconfigured → `?error=unavailable` redirect, not JSON; `access_denied` → cancelled
    redirect with nothing created; state missing / mismatched / expired; happy path sets the
    cookie and redirects per role; `returnTo` honoured and sanitised; logout clears the cookie
    and bumps `sessionVersion`.
12. **Page primitives (F2, F3, F4).** `app/src/lib/session.ts`, `app/src/lib/nav.ts`,
    `ui/src/backend/shell/AppShell.tsx`, `ui/src/backend/actions/WorkflowAction.tsx`; export
    both from `ui/src/backend/index.ts`.
    *Test:* `session.test.ts` — no cookie → redirect with `returnTo`; wrong role → own home;
    right role → session; `homeFor` for all three roles. `AppShell.test.tsx` and
    `WorkflowAction.test.tsx` under jsdom — pending state, success callback, error surfaced from
    the envelope, and that `AppShell` renders its `nav` slot.
13. **Pages.** `(auth)/sign-in/page.tsx` (GitHub first, email disabled with a note, and the
    `cancelled` / `state` / `unavailable` messages); `(mentee)/layout.tsx` + `home/page.tsx`;
    `(mentor)/layout.tsx` + `mentor/page.tsx`; port `admin/layout.tsx` onto `AppShell`
    **preserving an accessible `link "Users"`**.
    *Test:* each page invoked directly per step 0b. Integration `auth.integration.test.ts` —
    a cancelled authorisation shows the notice and creates nothing; a full sign-in through the
    **mock identity adapter** lands on the mentee home; a mentor lands on the mentor home; an
    expired session on a signed-in screen redirects and reveals nothing.
    `admin.integration.test.ts` must still pass unchanged.
14. **Docs.** `AGENTS.md`: the three-surface taxonomy, the cross-cutting-folder rule, the
    navigated-vs-fetched route rule, and the component-testing approach from step 0b.
    `README.md`: the new variables and how to create a GitHub OAuth app. Fix the `uuid v7`
    docblock in `packages/db/src/entities/base.entity.ts` — the ids are v4.

### Phase 2 — Email and password (#13)

15. **Migration + entity.** `auth-password`: `password_hash` (`varchar(60)`, nullable), with
    `down` and the same up/down migration test as step 4. Seeder: give the mentee and the
    operator a hash.
16. **Password service (B9).** Add `bcryptjs` (pinned) to `packages/core/package.json`; cost 12
    as a named constant with the reason.
    *Test:* hash ≠ plaintext; verify true/false; a null hash never verifies.
17. **Rate limiter (B8).** `core/src/http/rate-limit.ts`, driven by the clock.
    *Test:* under the limit passes; at the limit throws; the window rolls over; per-IP and
    per-email keys are independent.
18. **Mailer port + log adapter (B14).** `mailer.port.ts`, `adapters/log-mailer.ts`; register
    `mailer`; `MAIL_FROM` optional with a default.
    *Test:* the adapter logs recipient and subject and never the body; a throwing transport is
    logged and swallowed.
19. **Verification service.** `email-verification.service.ts` on `token.service` with purpose
    `email-verify`.
    *Test:* issue→verify; expired; wrong purpose; **already-verified is idempotent, not an
    error** (a mail scanner prefetching the link must not break the user).
20. **Schemas.** `register.schema.ts`, `login.schema.ts`.
    *Test:* min length, email shape, `returnTo` optional.
21. **Service methods.** `registerWithPassword` (409 pointing to GitHub when the email carries a
    `githubId`; otherwise create `role: 'mentee'`, `emailVerifiedAt` null, send the
    verification); `authenticateWithPassword` (one generic `UnauthorizedError` for both unknown
    email and wrong password; no session before `emailVerifiedAt`). Verification sets
    `emailVerifiedAt`, which is also what later makes the row linkable by GitHub sign-in.
    *Test:* every branch, including that the two failure messages are byte-identical.
22. **Routes.** `api/auth/register`, `api/auth/login`, `api/auth/verify-email` — rate-limited,
    `apiHandler`, `force-dynamic`.
    *Test:* happy paths; the generic failure sets no cookie; the rate limit trips; verification
    redirects through `safeReturnTo`.
23. **Pages + shadcn fields (F5).** `npx shadcn@latest add input label` in `packages/ui`; back
    `CrudForm`'s renderers with them; add the `password` field type. `(auth)/register/page.tsx`;
    enable the email form on `/sign-in` (GitHub stays first).
    *Test:* `CrudForm.test.tsx` under jsdom for the `password` type and server `fieldErrors`
    mapping. Integration: a wrong password shows the generic message and sets no cookie.

### Phase 3 — Roles and scoping (#14)

24. **`requireCsrfHeader` (B3).** In `core/src/http/auth.ts`.
    *Test:* header present / absent / wrong value; safe methods exempt.
25. **Lock `/api/users`.** `authorize: async (req) => { await requireRole(await
    requireSession(req), 'operator'); }` — note the braces: `authorize` is typed
    `(req, cradle) => void | Promise<void>` (`makeCrudRoute.ts:33`) and `requireRole` returns a
    `Session`, so an expression body would not typecheck. Move `admin/users/page.tsx` under the
    guarded layout; update `admin.integration.test.ts` to sign in as the operator first. List it
    under "Breaking changes" in the PR body.
    *Test:* anonymous → 401; mentee → 403; operator → 200.
26. **CSRF on every state-changing route.** `logout`, `register`, `login`, `POST /api/users`.
    *Test:* each route refuses without the header.
27. **Page guards and navigation.** `requirePageRole` in all three layouts; per-persona nav from
    `app/src/lib/nav.ts`; no "become a mentor" link or route anywhere (R07).
    *Test:* each layout for the missing-session, wrong-role and right-role paths.
28. **Negative-assertion helper (F7) + integration.** `tests/integration/assertions.ts`
    (`expectAbsent`); `tests/integration/roles.integration.test.ts` — a mentee opening a mentor
    screen is sent home; a mentor opening `/admin` is refused; no "become a mentor" affordance
    exists for any signed-in role; the operator sees the users list and a mentee gets a 403 from
    `/api/users`.
29. **Docs.** `BACKWARD_COMPATIBILITY.md` §1 (`/api/users` is operator-only; the CSRF
    requirement) and §7 (the `Role` union in use; the preserved `link "Users"`).

## ✅ Acceptance criteria

Carried in intent from #12, #13 and #14, with the naming decision applied.

**Phase 1 (#12)**
- A developer authorising DevMentor on GitHub gets an account tied to that GitHub identity and
  lands on the mentee home. (R06, D07)
- A mentor's GitHub sign-in lands on the mentor home, not the mentee home. (D07)
- Cancelling the GitHub authorisation creates no account and the sign-in screen says so.
- An expired session on a signed-in screen asks for sign-in again, and nothing of the user's is
  shown before that.
- Every sign-in screen offers GitHub first and email second. (D07)
- A GitHub email matching an unverified local row links nothing and explains why. (security)

**Phase 2 (#13)**
- A user without GitHub registers, confirms their email, and lands on the mentee home. (R06)
- A wrong password fails with a message that does not say which part was wrong, and starts no
  session.
- An email already tied to a GitHub account is refused with a pointer to GitHub sign-in.
- An invited mentor without GitHub can complete the invitation with email and password and still
  get the mentor role. (D07, R07 — the invitation itself is #15)

**Phase 3 (#14)**
- A mentee opening a mentor-only screen is refused and sent to their home. (D05)
- A mentor opening an operator screen is refused.
- Founder A and founder B hold the operator role; no account can be given it in 1.0 except by a
  founder editing the allowlist, and every such change is logged. (D19, R18)
- A mentee listing users is refused; only the operator may. (data scoping)
- A signed-in user looking for a way to become a mentor finds none. (R07)

## 📋 Decisions in play

- **D07 / R06** — GitHub for every role, email plus password as the fallback (founder A)
- **D19 / R18** — the operator is the two founders; by-hand actions logged (both founders)
- **R07 / D08** — mentors join by invitation only; no open registration (founder A)
- **D05** — 1.0 is the session marketplace with accounts and roles (founder A)

## 📝 Resolved in this spec

Both were carried as non-blocking on #12 and are now decided:

- **Mentee vs `student`** → `mentee`, everywhere, in Phase 1, while `Role` has no consumers.
- **Session lifetime** → 24 hours with no refresh flow, as the standards spec's stated known
  limitation — but **with revocation**, via `session_version`, which that spec did not cover.
  Revisit at the 2026-11-28 retrospective (D23).

## 📝 Open questions

- **Which mail transport ships for 1.0** (owner: founder A, from #13). Non-blocking: the log
  adapter behind `mailer.port.ts` is enough for development, tests and CI. A real adapter is
  needed before the October invitation batch goes out (D16, #15) — an adapter swap, no caller
  changes.
- **Whether a founder who is also a mentor holds two roles or two accounts** (owner: both
  founders, from #14). Non-blocking: the allowlist grants `operator` to that account; a mentor
  profile on the same account is allowed unless founder A says otherwise. With a single stored
  `role`, a founder-mentor signs in as `operator` and loses the mentor screens — if that becomes
  real, the answer is a second account, not a role array.

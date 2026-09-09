# DevMentor — Mentors Become Bookable (E02)

Date: 2026-09-08
Status: active — moves to `implemented/` when its four first-iteration slices land
Issue: [#8](https://github.com/open-mercato/ai_techleaders_project/issues/8) — stories #15, #16, #17, #18
Design authority: `.ai/specs/product-brief.md`, `.ai/specs/2026-09-01-engineering-standards.md`
Builds on: `.ai/specs/2026-09-04-accounts-and-roles.md` (E01), `.ai/specs/2026-09-04-platform-primitives.md`
Uses the non-normative pattern catalogue: `.ai/specs/2026-09-08-platform-primitives-ii.md`
Story specs: `2026-09-08-invitations.md`, `-mentor-page.md`, `-availability-slots.md`,
`-mentor-prices.md` — each owns its acceptance criteria and screens; this document is the sole
authority for architecture, data model and contracts shared by those four stories. Stripe Connect is
a separate 1.1 capability owned by `2026-09-08-stripe-connect-onboarding.md`; this epic records only
the launch dependency on it.

**Prerequisites — E01 Slices 1, 2 and 4, not Slice 2 alone.** E01 is specified but *not implemented*:
`packages/core/src/http/auth.ts:22-31` returns `null` unconditionally, `Role` is still
`'student' | 'mentor'`, `User` has no role column, `/api/users` passes no `authorize`, and no
`/api/auth/*` route exists. Three separate dependencies, because getting this wrong blocks Slice 1 on
its first day:

| E01 slice | What E02 needs from it |
|---|---|
| Slice 1 | **The React test toolchain.** `vitest.config.mts:5` is `environment: 'node'` and the workspace has no `jsdom`, no `@testing-library/*`, no `@vitejs/plugin-react`. `LocalTime`, `ReadinessChecklist`, `useApiResource`, `ResourcePanel` and three `CrudForm` field types cannot reach the mandated 100%-per-file bar without it. |
| Slice 2 | The session mechanism, the `mentee \| mentor \| operator` role set, `requireSession(req, cradle)`, `requireCsrfHeader`, `withRequestScope`, `grantRole`, and `app/src/lib/session.ts`'s page guards. |
| Slice 4 | shadcn `input` and `label`, which F5′'s `datetime` and `money` fields render. |

If E02 must start before E01 Slice 1 or Slice 4 lands, the missing piece becomes **E02 Slice 0** and is
named as such in a PR of its own — it is never smuggled into a feature slice, because
`vitest.config.mts` is where this repository's coverage law lives.

## 📝 TLDR

E02 turns an invited senior engineer into a discoverable, price-configured source of availability: an
invitation that grants the mentor role, a public mentor page behind a share link, published slots, and
25- and 50-minute prices inside operator bounds. E01 built the request floor — session, errors, CSRF,
clock. This spec adds only the domain mechanisms those four slices call; Platform Primitives II indexes
those patterns but does not define a second copy of their contracts.

Paid booking is **not production-launchable** merely because these four slices have landed. Q19 is an
unresolved conflict between D03/D13's first-iteration bar and R05's Stripe-only payout rule; the E03
Checkout flow remains release-blocked until the founders resolve it or approve a superseding decision.

## 📝 Problem Statement

### The feature problem

Nothing in the repository represents an invitation, a mentor page, availability, or a price.
`MentorProfile` (`packages/db/src/entities/mentors/mentor-profile.entity.ts`) holds three placeholder
fields — `headline`, `bio`, `yearsOfExperience` — hanging off one seeded user, and the only migration
in the repo creates exactly two tables.

The mentor interviewed on 2026-08-22 already answers these questions for free: *"two evenings a
month, for free, and the notes rot."* D18 makes the invitation itself the test of A03 — at least one
bookable session within two weeks of accepting, in batches of 20, with fewer than 5 of the first 20
stopping further invitations. Until a senior engineer can publish a priced, bookable session, that
experiment cannot run at all, and D16's ship date of 2026-10-31 has nothing to sell.

### The framework problem

Primitives I surveyed issues #12–#34 for *infrastructure* shapes and headed off nine of them. It did
not survey the backlog for **feature archetypes** — the recurring shape of a route and the screen in
front of it. Twelve appear; ten have their first consumer in E02. The full survey with per-issue
evidence — including which later issues reuse each archetype — is in Platform Primitives II, which is
the single place that table is maintained. What matters here is which archetypes E02 is first to
touch:

| First used by | Archetype |
|---|---|
| **E02-S01** (#15) | Single-use token grant · deadline obligation · R18 operator action |
| **E02-S02** (#16) | Owner-scoped singleton · public read model · controlled vocabulary · readiness gate |
| **E02-S03** (#17) | Owner-scoped collection · guarded state transition |
| **E02-S04** (#18) | Money path |
| **1.1 Connect** (#19) | External integration; specified and delivered independently of E02 |

Three of these are already written three different ways in the filed issues — the "you cannot
publish / cannot be booked / cannot be paid until X" rule appears as a thrown `ValidationError` in
#16, a boolean `isBookable()` in #18, and prose in #19. Same computation, same screen, three
implementations. That is the concrete waste this spec removes.

### What E02 cannot defer

`MentorProfile` is the one table S01, S02, S03 and S04 all widen, and `Slot` is the table E03 books
against. Specified independently, the schema gets designed four times by four PRs. That is why this
epic document owns the data model even though each story keeps its own thin spec.

## 📝 Proposed Solution

Four slices, each one PR, each leaving the app working, ordered so each unblocks the next. They are the
first-iteration E02 work in D13. Stripe Connect is a separate 1.1 capability and does not control this
epic's lifecycle.

1. **Invitation and role grant (#15)** — `Invitation`, the accept transaction that adds `mentor`
   without removing a role, the by-hand `invite` script (R18), the mentor home with its publish-by
   date. *Unblocks every other slice: nothing else has a mentor to act as.*
2. **Mentor page and share link (#16)** — the real `MentorProfile` fields, the stack-tag vocabulary,
   the publish readiness gate, `/m/<slug>` for signed-out visitors.
3. **Slots (#17)** — `Slot`, publish and remove, and the public page's booking-agnostic slot list.
4. **Prices and offer readiness (#18)** — two prices in one platform currency inside operator bounds,
   the settings service, and the readiness gate the public page and E03-S02 both read.
Platform Primitives II is an index of the patterns these stories establish, not a separately shippable
framework and not another implementation authority. A primitive lands only in the story that first
uses it; candidates with no current production caller stay deferred.

One architectural law, stated with its evidence in Platform Primitives II and applied in three places
here:

> **Policy is read at the transition and snapshotted; it is never re-derived at read time.**

In E02 that means `Invitation.expiresAt` and `Invitation.publishDueAt` are stored instants written
when the invitation is created and accepted, never `INTERVAL` arithmetic in a query.

### Alternatives considered

- **Four independent story specs, no epic document** (what the first-iteration issues ask for).
  Rejected: all four widen `MentorProfile`, and E03 books against `Slot`. Four PRs designing one table
  is how a schema drifts. The thin story specs survive and own their acceptance criteria and screens.
- **Defer the framework to E03.** Rejected on the evidence above: by E03 the archetypes have been
  used nine more times, and the pattern is whatever E02 happened to write.
- **Build the framework first, as its own PR.** Rejected on `AGENTS.md`'s YAGNI rule and Primitives
  I's ship gate. Every entry lands inside the slice that calls it.
- **Recurring availability** (a weekly schedule rather than individual start times). Rejected for
  1.0: D22 says *"mentors publish slots"* and nothing more, recurrence needs an expansion engine and
  a DST policy, and #17 already tags single start times as the plain reading. Revisit if mentors
  complain about publishing effort — which is exactly the signal D18's batch report surfaces.
- **A generic RBAC/permission layer** now that a second role-granting flow exists. Rejected: E01
  fixed the role set deliberately, and invitation acceptance is `grantRole(user, 'mentor')` — one
  call, not a policy engine.

## 📝 What the market leaders get right, and what we can skip

Challenged against Cal.com (open-source scheduling), the mentor marketplaces (ADPList, Codementor,
Superpeer), and Stripe's own Connect guidance.

**Adopted, because they are cheap and we would otherwise rediscover them the hard way:**

- **Cal.com stores instants and renders in the viewer's zone, and treats `<input type="datetime-local">`
  as a local wall-clock string that must be converted before it leaves the browser.** Both are in
  this spec (F8, F5′). Skipping the second one is how a mentor in Warsaw publishes a slot that
  appears two hours off to a mentee in London.
- **Every mentor marketplace has a profile-completeness meter**, and it is always the same list the
  server uses to decide whether the profile is listable. That is B22 + F9, and it is why #16's
  "publish is refused and the missing link is named" is a primitive here rather than an `if`.
- **Stripe Connect account links expire in minutes.** The standalone 1.1 Connect spec therefore never
  stores them and mints a fresh link per start. That story owns provider reconciliation and user-facing
  status; E02 does not partially implement either.
- **Invitations everywhere (GitHub, Slack, Linear) are single-use, expiring, revocable and
  re-sendable.** #15 specifies the first two; revoke and resend are added here as service methods,
  because the operator sending 20 by hand (R18) will get an address wrong within the first batch.

**Deliberately skipped, with the reason:**

- **Buffers between sessions, minimum notice per mentor, daily booking caps** (Cal.com has all
  three). Nothing in the brief asks for them; D22 fixes a single global two-hour lead. The occupancy
  rule below is the one anti-overlap mechanism, and a buffer is an additive column later.
- **Calendar sync (CalDAV/Google), availability schedules, round-robin, team pages.** Out of 1.0 by
  D05; a mentor publishing individual start times is the whole of D22.
- **Ratings, reviews and rankings** — forbidden by N02, and asserted *negatively* in E02's tests.
  Worth recording that this is the spec's most contrarian choice against every comparable product:
  ADPList, Codementor and Superpeer all lead with a score. N02's replacement is a link to public work
  and a plain description (R04), and the synthetic panel's objection — that mentees then have nothing
  to choose by — is already tracked as hypothesis E00-T06. This spec implements N02 as written and
  does not hedge it.
- **A slug redirect table.** Cal.com keeps old usernames alive; we make the slug immutable after
  publish and handle a rename as an operator action under R18 until a story needs aliases.

## 📝 Architecture

No new package and no new boundary. New and changed files by package; `†` marks a pattern indexed by
Platform Primitives II. The exact contract remains owned here and in the relevant story.

```
packages/db/src/
  entities/invitations/invitation.entity.ts        Slice 1
  entities/availability/slot.entity.ts             Slice 3
  entities/mentors/mentor-profile.entity.ts      + initialPublishDueAt                        (Slice 1)
                                                 + slug, publicWorkUrl, stackTags, publishedAt (Slice 2)
                                                 + lastPublishedAvailabilityAt                (Slice 3)
                                                 + price25Cents, price50Cents                  (Slice 4)
  entities/index.ts                              + Invitation, Slot in the `entities` array
packages/db/migrations/                          (a sibling of src/, not inside it)
  …-invitations.ts  …-mentor-page.ts  …-availability-slots.ts
  …-mentor-prices.ts                                      (each with up AND down, §3)
  seeders/database.seeder.ts                     ~ Ada keeps `headline`, gains slug/tags/prices/a slot

packages/core/src/
  domain/readiness.ts                              † B22    (Slice 2)
  domain/vocabulary.ts                             † B25   (Slice 2)
  domain/vocabularies/{stack-tags,session-lengths}.ts       (Slices 2, 4)
  domain/slug.ts                                   † B21′   (Slice 2)
  money/money.ts                                   † B12′   (Slice 4)
  http/owned-route.ts                              † B23   (Slice 2)
  services/auth/token.service.ts                 + † B5′ opaque pair                    (Slice 1)
  services/auth/user.service.ts                  ~ grantRole called by invitation accept (Slice 1)
  services/invitations/invitation.service.ts       Slice 1
  services/mentors/mentor-profile.service.ts       Slices 2, 4
  services/mentors/readiness.ts                    page and price gates                   (Slices 2, 4)
  services/availability/slot.service.ts            Slice 3
  services/operator/platform-settings.service.ts   † B16′   (Slice 4)
  validators/mentors/{mentor-profile-update,mentor-prices-update}.schema.ts
  validators/availability/slot-create.schema.ts
  config/env.ts                                  + PLATFORM_CURRENCY, PLATFORM_PRICE_BOUNDS (Slice 4),
                                                   INVITATION_TTL_DAYS,
                                                   MENTOR_PUBLISH_WINDOW_DAYS (Slice 1)
  container/{container,cradle}.ts                + one registration per new service
  events/event-map.ts                            + invitations.invitation.accepted,
                                                   mentors.profile.published,
                                                   availability.slot.published

packages/ui/src/
  time/{LocalTime.tsx,formatInstant.ts}            † F8  surface-agnostic — /m/<slug> uses it (Slice 1)
  backend/feedback/ReadinessChecklist.tsx          † F9     (Slice 2)
  backend/api/useApiResource.ts                    † F10    (Slice 2)
  backend/panels/ResourcePanel.tsx                 † F10    (Slice 2)
  backend/forms/CrudForm.tsx                     + multiselect, datetime, money field types † F5′
  components/ui/{checkbox,badge}.tsx               via `npx shadcn@latest add`             (Slice 2)
  components/mentors/MentorPageView.tsx            the public page body, shared by /m/<slug>

packages/app/src/app/
  (mentor)/mentor/page.tsx                       ~ the publish-by ask and readiness         (Slice 1)
  (mentor)/mentor/{profile,slots,prices}/page.tsx
  invitation/[token]/page.tsx                      public, ungrouped like m/[slug]   (Slice 1)
  m/[slug]/page.tsx                                Slice 2
  api/invitations/[token]/route.ts, …/accept/route.ts
  api/mentors/me/route.ts, …/publish/route.ts, …/unpublish/route.ts, …/prices/route.ts
  api/mentors/[slug]/route.ts                      public read
  api/availability/slots/route.ts, …/[id]/route.ts

scripts/invite.ts                                  R18, run with tsx                        (Slice 1)
tests/integration/fixtures/mentor.ts               † T1
```

Three boundary facts this layout respects, all forced by `eslint.config.mjs` and the manifests:

- **`ui` never imports `core`.** The stack-tag picker cannot import the vocabulary; its options travel
  as a page prop. `ReadinessChecklist` takes plain items, not a `Readiness` type.
- **`core` never imports `next`.** `owned-route.ts` takes a plain `Request` and returns a `Response`;
  the `(mentor)` layout's guard uses `packages/app/src/lib/session.ts` from E01.
- **`db` is the leaf.** A migration cannot call a `core` helper, so the `stack_tags` CHECK literal is
  hand-written SQL with a core-side drift test (B25). E03 will own its booking and occupancy storage.

And one rule inherited from E01 that E02 must keep paying: **authorization is enforced at the page and
at the service, never at the layout alone.** E01's request scope injects the one live `Session | null`
into each service; E02 does not establish a second convention that passes another session through every
method. App Router layouts do not re-render on client-side
navigation, so a guard living only in `(mentor)/layout.tsx` does not run when the router fetches
`/mentor/prices` as a segment. Each of E02's four mentor pages therefore calls
`requirePageRole('mentor')` itself, and each service method independently requires an authorized
`Session`. The layout guard stays for the redirect experience; it is not the boundary.

### Downstream booking compatibility

E02 deliberately ships booking-agnostic slots. It fixes only three compatibility requirements for
E03: `Slot` never gains a `bookingId`; E03's `Booking.slotId` is immutable so history survives removal
and republication; and the completed booking design must make overlapping active sessions for one
mentor impossible under concurrency. E03 owns the exact statuses, interval representation,
transactions, locks, database constraints, expiry processing and late-payment outcome. No E02
production code or acceptance criterion implements those choices early.

## 📝 Data Model

Four additive migrations, each with `up` **and** `down` (§3), each generated from the entity diff.
Every entity uses `defineEntity` + `p` builders inside `defineSingletonEntity`, keeps `baseProperties`,
and is added by hand to the `entities` array in `packages/db/src/entities/index.ts`.

### `invitations` — Slice 1 (new)

| Column | Type | Notes |
|---|---|---|
| `email` | `varchar(255)` not null | normalized invited address; partial unique index while unresolved (`accepted_at` and `revoked_at` both null) |
| `token_hash` | `varchar(64)` not null, **unique** | SHA-256 hex of a 32-byte token; the raw token is only ever in the link |
| `stack_tags` | `text[]` not null | subset of the `StackTags` vocabulary (R16); `CHECK` with a hand-written literal list — see B25's boundary note |
| `expires_at` | `timestamptz` not null | `createdAt + INVITATION_TTL_DAYS` (14), snapshotted |
| `accepted_at` | `timestamptz` null | |
| `accepted_by_id` | `uuid` null, FK `users` | **not unique** — see below |
| `publish_due_at` | `timestamptz` null | `acceptedAt + MENTOR_PUBLISH_WINDOW_DAYS` (14, R17), snapshotted |
| `revoked_at` | `timestamptz` null | the operator's undo for a wrong address |
| `batch` | `varchar(64)` null | free text until #30 gives batches a table |

`token_hash` is unique so a duplicate mint is a constraint violation rather than two live links. The
partial state (`accepted_at` set with `accepted_by_id` null, or the reverse) is impossible because both
are written in one transaction; a `CHECK ((accepted_at IS NULL) = (accepted_by_id IS NULL))` makes that
structural rather than trusted.

There is at most one unresolved invitation per normalized email. An expired unresolved invitation is
resent (rotating its token and expiry) or explicitly revoked before a new invitation can be created;
this prevents concurrent rows from double-counting one person in D18's batch report. The partial unique
index arbitrates concurrent creates. If a verified user already exists for the address, `create` locks
that user first and refuses while they currently hold `mentor`; a deliberately removed mentor can be
invited again only after the audited role-removal transaction commits.

Acceptance is bound to identity, not merely possession of the URL. Inside the transaction, the service
locks and reloads the persisted user first, then locks the invitation row, revalidates its state,
requires `emailVerifiedAt` and compares the user's normalized persisted email with `Invitation.email`.
It then locks or creates the one profile for that user. This shared user-first order serializes role,
profile and initial-deadline effects even if different historical invitation tokens are submitted.
A mismatch grants no role, creates no profile, consumes no invitation and issues no session. `revoke`
and `resend` each lock and revalidate the invitation row; accept-versus-revoke/resend therefore has one
winner. Emergency role removal after acceptance is the separate audited `UserService.revokeRole`.

**`accepted_by_id` is deliberately not unique.** A unique constraint reading "one accepted invitation
per user" would block an audited recovery in which a mentor's role is later removed and the same person
is deliberately invited again. A user may legitimately hold more than one accepted invitation over
time. What must be idempotent is the *effect*, and it is:
`grantRole` is set-based, and `accept` creates a `MentorProfile` only when the user has none. The first
accepted invitation also sets `MentorProfile.initialPublishDueAt` when that field is null. Later
invitations keep their own `publishDueAt` for batch reporting but never reset the mentor's original
obligation.

### `mentor_profiles` — Slices 1–4 (widened)

| Column | Type | Slice | Notes |
|---|---|---|---|
| `initial_publish_due_at` | `timestamptz` null | 1 | first accepted invitation's deadline; set once, never reset |
| `slug` | `varchar(60)` null, **unique** | 2 | generated atomically on first publish and immutable afterward |
| `public_work_url` | `text` null | 2 | R04; validated `z.string().url()` with an `https?:` protocol check |
| `bio` | existing `text` null | 2 | reused as R04's plain description; 1–2000 chars, no duplicate `description` column |
| `stack_tags` | `text[]` not null default `'{}'` | 2 | `CHECK` with the same hand-written literal (R16, D21) |
| `published_at` | `timestamptz` null | 2 | non-null ⇒ the page is public |
| `last_published_availability_at` | `timestamptz` null | 3 | B26; introduced and maintained with slots, read by #20 (R13) |
| `price_25_cents` | `integer` null | 4 | minor units; `CHECK > 0` |
| `price_50_cents` | `integer` null | 4 | minor units; `CHECK > 0` |

**`slug` stays nullable until first publication.** `publish()` locks the profile, generates a candidate
from the display name and attempts one candidate per transaction. Only a violation of the named slug
unique constraint triggers retry; the failed transaction is discarded before a fresh transaction
re-queries collisions. `MAX_SLUG_ATTEMPTS` is 100, after which a retryable `ConflictError` is returned.
Normalization that produces no characters uses `mentor` as the base, and the base is truncated for
every suffix so the complete slug never exceeds 60 characters. The winning transaction stores the
slug once and sets `publishedAt`. Concurrent publication of the same profile serializes on its row;
the follower returns the already-published DTO. `unpublish()` takes the same profile lock and clears
only `publishedAt`; concurrent publish/unpublish operations therefore commit in lock order, with the
last completed transition visible. Republishing keeps the same slug and old links work. This lets
Slice 1 continue creating an empty profile after the Slice 2 migration and avoids a temporary invalid
profile state.

`headline`, `bio` and `yearsOfExperience` are **kept**. `bio` becomes the one canonical R04 description
field rather than adding a parallel column. `BACKWARD_COMPATIBILITY.md` lists them under
"what is not protected", but `database.seeder.ts` and `tests/integration/admin.integration.test.ts`
both assert `Systems & algorithms mentor`; retiring them is a separate expand-then-contract PR with
no product value in E02 (#16's open question, answered: keep).

**The two prices move together.** An `updatePrices` call always carries both values and validates them
against the single configured platform currency's bounds in one transaction. Currency is not stored
per mentor in 1.0. The initial currency remains a founder-owned product choice; the implementation is
blocked until founder A confirms the proposed `USD` default or records another two-decimal currency.

### `slots` — Slice 3 (new)

| Column | Type | Notes |
|---|---|---|
| `mentor_profile_id` | `uuid` not null, FK, `on delete cascade` | |
| `starts_at` | `timestamptz` not null | an instant, always UTC (B1) |
| `removed_at` | `timestamptz` null | the mentor's own removal; kept, not deleted, so E03 can explain a vanished slot |

Unique index on `(mentor_profile_id, starts_at)` where `removed_at is null` — a partial unique index,
so a removed 14:00 slot does not block republishing 14:00. Index on
`(mentor_profile_id, starts_at)` for the read path.

`Slot` never owns a `booking_id` column or `booking` property. E03 adds immutable `Booking.slotId` and
retains historical references. E03 owns every rule for determining active occupancy and removal. This
avoids a false one-to-one relation that cannot represent multiple booking outcomes over time.

### Sensitive data

`token_hash` is a hash, never the token; the raw invitation token exists only in the emitted link and
in the `invite` script's stdout. An invited person's email address appears on the public invitation
page only after the token has been presented, and never in a list. Public profile DTOs are explicit
allowlists held by key-equality tests.

## 📝 API Contracts

Every route is wrapped in `apiHandler` (directly or through a factory), returns the `{ ok, data }` /
`{ ok, error }` envelope (§1), and exports `dynamic = 'force-dynamic'` where it touches the database.
Owner routes are built with `makeOwnedResourceRoute` / `makeOwnedCollectionRoute` / `ownedAction`
(B23). They keep `requireSession` / `requireRole` visible at the route for defence in depth and
delegate to services whose E01-injected request-scoped session remains authoritative. **CSRF has one
owner:** E01's `apiHandler` checks every state-changing verb. An owned factory never performs a second
check and never defines its own opt-out.

| Route | Method | Auth | Body / query | Answer |
|---|---|---|---|---|
| `/api/invitations/[token]` | GET | public | — | `{ email, stackTags, expiresAt }`, or `404 not_found` |
| `/api/invitations/[token]/accept` | POST | session + central CSRF, **no role** | — | `{ roles, publishDueAt }` **+ a re-issued session cookie**, `404` unknown/expired/revoked/consumed, `403` verified-email mismatch |
| `/api/mentors/me/onboarding` | GET | `mentor` | — | `{ initialPublishDueAt }`, the durable Slice 1 mentor-home read |
| `/api/mentors/me` | GET, PUT | `mentor`; CSRF on `PUT` | `mentorProfileUpdateSchema` | owner DTO incl. `readiness` |
| `/api/mentors/me/publish` | POST | `mentor` + CSRF | — | owner DTO, or `422` with `fieldErrors` from the readiness gate |
| `/api/mentors/me/unpublish` | POST | `mentor` + CSRF | — | owner DTO with `publishedAt: null`; slug retained |
| `/api/mentors/me/prices` | PUT | `mentor` + CSRF | `mentorPricesUpdateSchema` | owner DTO, or `422` naming the breached bound |
| `/api/mentors/[slug]` | GET | **public** | — | public DTO; `prices` and slots as defined below; `404` if unpublished; E03 additively adds viable lengths |
| `/api/availability/slots` | GET, POST | `mentor`; CSRF on `POST` | `slotCreateSchema` | the mentor's slots / the created slot |
| `/api/availability/slots/[id]` | DELETE | `mentor` + CSRF | — | `{ id }`; E03 adds the active-booking conflict |

**Accepting an invitation must re-issue the caller's session, and forgetting this signs them out.**
E01 puts `grantRole` on `session_version`'s closed list of bump triggers and says why: *"a role change
re-issues the caller's session in the same request rather than ejecting them, and only a route handler
can set a cookie in the App Router"* — published there explicitly *"for #15, which is the first grant
path"*. So `POST /api/invitations/[token]/accept` commits its transaction, then signs a fresh cookie
carrying the new `sessionVersion` and returns it on its own response. Without that line the accept
succeeds, the caller's own action invalidates their token, and the redirect to `/mentor` lands on the
sign-in page — the single most important flow in the epic, broken by omission.

It is also why the route requires a session but **no role**: the caller is a `mentee` who does not yet
hold `mentor`, so a role guard would refuse the very request that grants the role.

One further contract rule carried from E01 and applied here without exception:

- **`GET /api/mentors/[slug]` is public and therefore a projection boundary.** It returns
  `toPublicDto` and nothing else; the key-equality test is what keeps it that way.

Price reads use storage-safe values, never formatted decimal strings. The public DTO contains
`prices: { price25Cents: number; price50Cents: number; currency: string } | null` and slots as
`{ id, startsAt, meetsLeadTime }`, where `meetsLeadTime = startsAt >= now + 2h`. The owner DTO uses
the same price object and additionally contains `priceBounds: { p25: PriceBounds; p50: PriceBounds }`;
bounds never cross the public projection. E03 snapshots the cents and currency directly from this
server-owned representation and additively supplies viable lengths.

Shared schemas in `core/src/validators/`, imported by both the route and `CrudForm`:

```ts
// Every field is optional: a mentor saves incrementally, and completeness is the publish gate's job,
// not the schema's. Making these required would make `mentorPagePublishable` unreachable through the
// only screen that writes them — and with it, #16's "the missing link is named" acceptance criterion.
mentorProfileUpdateSchema = { publicWorkUrl: z.string().url().refine(https-or-http).optional(),
                              bio: z.string().min(1).max(2000).optional(),
                              stackTags: z.array(StackTags.schema).max(4).optional() }
exactMajorDecimalString   = z.string().max(11).regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/)
mentorPricesUpdateSchema  = { price25: exactMajorDecimalString,
                              price50: exactMajorDecimalString }           // service parses to cents and checks bounds
slotCreateSchema          = { startsAt: z.string().datetime() }             // shape only; temporal policy
                                                                            // uses the injected server clock
```

**Where each kind of rule lives, because the split is load-bearing.** *Shape* is the schema's job and
is checked identically on both sides: is this a URL, is this an ISO instant, is this a member of the
vocabulary. *Completeness* is the readiness gate's job at the transition that requires it — which is
why `mentorProfileUpdateSchema` is entirely optional fields. *Policy that needs server state* — the
price bounds, the two-hour lead, whether `now` is past a slot — is the service's job, never the
schema's: a shared schema that rejects a past instant validates the same payload differently at
different moments and against a client clock the server does not trust.

Bounds are checked in the service, not the schema, because the schema is shared with the client and
the bounds come from a service the client cannot call. The form receives the single platform currency
and its bounds as props and shows them as help text; the server is the authority.
`parseMajorAmount` uses string arithmetic and rejects a result above PostgreSQL `integer` maximum
`2_147_483_647`; the request's 11-character cap bounds parsing work before conversion.

**Error codes** — all existing (§1): `404 not_found` for an unknown, expired, revoked or consumed
invitation and for an unpublished slug; `403 forbidden` for an invitation/account email mismatch;
`409 conflict` for duplicate active slots or active booking conflicts added by E03; and
`422 validation_failed` with `fieldErrors` for a failed readiness gate or a breached bound.

**One deliberate information choice.** An unknown token, an expired token and a revoked token all
answer `404` with the same message — *"This invitation is not valid."* Distinguishing them would tell
an enumerator which of their guesses had once been real. The operator can see the difference in the
database; the visitor cannot.

### Domain events (§6, all additive)

`invitations.invitation.accepted` `{ invitationId, userId, publishDueAt }`,
`mentors.profile.published` `{ mentorProfileId, slug }`, and
`availability.slot.published` `{ mentorProfileId, slotId, startsAt }`.
In-process only, subscribers log; the bus swallows handler failures, so nothing durable rides on them
(Primitives I B15's rule).

## 📝 UI/UX

**Per-screen detail lives in the four story specs**, which own the screens by the division of labour at
the top of this document. What follows is only what is cross-cutting or would otherwise be decided four
times.

**Surfaces.** Per the three-surface taxonomy (Primitives I F1): `/m/<slug>` and `/invitation/<token>`
are **public** Tailwind pages; every `(mentor)/*` screen is **app** surface — shadcn inside `AppShell`.
`/admin/users` stays **admin**.

**The mentor home is the spine of D18's experiment**, and it is the one screen no single story owns —
it aggregates all four. It renders one `ReadinessChecklist` titled with the ask R17 requires,
*"Publish at least one bookable session by <date>"*, the date through `LocalTime`, and its items are
the union of the page gate, the price gate and "at least one future slot". The date comes from the
Slice 1 onboarding-status read contract. Everything the mentor still has to do is on one screen;
`ReadinessChecklist.actionsByKey` maps each item to the screen that fixes it without putting app routes
inside a core DTO. This is the concrete reason B22 and F9 exist rather than three bespoke `if`s.

**Four rules every E02 screen obeys:**

- **Every instant renders through `LocalTime`.** Never a server-formatted date, never a raw ISO string.
  Any form collecting an instant states the viewer's timezone next to the field — a mentor publishing
  availability is the one user who must be certain which clock they are using, and
  `<input type="datetime-local">` gives no indication of its own.
- **Every "you cannot do this yet" is a `ReadinessChecklist` fed by a B22 gate**, never prose written
  next to a disabled button. The gate's requirement keys are the form field names, so a refused
  transition's `fieldErrors` land next to the input that fixes them.
- **No score, review, rating or ranking appears in any markup** — ratings and reviews by N02/R04, the
  absence of a score-based order by D21/R13. Asserted negatively with `expectAbsent` (Primitives I F7),
  not merely omitted.
- **Every `(mentor)/*` page calls `requirePageRole('mentor')` itself.** The layout guard is for the
  redirect experience, not the boundary (see Architecture).

**Accessibility.** States use the existing `role="status"` / `role="alert"` feedback components;
readiness items carry a text state, not colour alone; the tag picker is a labelled checkbox group, not
a div listening for clicks.

## 📝 Edge Cases & Failure Scenarios

| Scenario | Behaviour |
|---|---|
| The same invitation link is opened twice | The first grants `mentor`; later GETs and POSTs return the same non-enumerating invalid/consumed state |
| Two tabs accept the same invitation simultaneously | The accept transaction locks the row; one wins, the other receives the same `404` invalid/consumed response. No second `grantRole` |
| An accepted invitation's user already holds `mentor` | Idempotent: `grantRole` is additive and set-based; no duplicate role, no second `MentorProfile` |
| A signed-in account's verified normalized email differs from the invitation | The page names the mismatch and offers sign-out; POST returns `403`, leaving the invitation pending and granting nothing |
| An expired or revoked link | `404`, one sentence, no account touched — and indistinguishable from an unknown token |
| A mentor publishes with no public-work link | `422`, `fieldErrors.publicWorkUrl`, the checklist item stays unmet |
| Two mentors named "Ada Lovelace" publish concurrently | The unique index arbitrates; the loser retries and receives `ada-lovelace-2` |
| A mentor renames themselves after publishing | The slug does not move; printed share links keep working |
| A mentor unpublishes and later republishes | The public route 404s while unpublished; republishing restores the same slug |
| A slot is published in the past | `SlotService.publish` rejects it using the injected server clock; the shape-only schema is unchanged |
| An 18:00 slot reaches the two-hour cutoff | It is eligible through 16:00 inclusive and becomes disabled after 16:00; E03 owns its booking-time recheck |
| A mentor removes a slot before bookings exist | E02 removes it; E03 later owns booking-aware removal behavior |
| A price is saved outside the bounds | `422` naming the bound that was breached for the single platform currency |
| The mentor page is published but unpriced | The public page says "not bookable yet" and offers no booking action; future availability may still be shown |
| E03 is ready before Q19 is resolved | Checkout remains a production-launch blocker; no money is collected under an undefined settlement policy |
| The database is unreachable | Public pages and the build are unaffected; every `force-dynamic` mentor route degrades per the existing rule |

## 📝 Risks & Impact Review

**Blast radius.** Everything is additive. The exceptions, each named with its mitigation:

- **`MentorProfile` is widened across four migrations.** `headline`, `bio` and
  `yearsOfExperience` stay; `bio` becomes the one product description. `slug` remains nullable and a
  database check makes `published_at IS NOT NULL` imply `slug IS NOT NULL`.
- **`/admin/users/page.tsx` is not part of E02.** F10 may migrate it to `useApiResource` as a separate
  refactor, but `DataTable` continues owning its loading/error/empty states and `ResourcePanel` is not
  used around a table.
- **The `entities` array changes twice (`Invitation`, `Slot`) and the committed
  `.snapshot-devmentor.json` changes with all four migrations.** Each
  migration ships `up` and `down` and is exercised both ways (§3), which the repository's single
  existing migration does **not** do — `Migration20260901142829.ts` has no `down()`. That is a
  pre-existing §3 violation this spec does not inherit and does not fix; it is worth a separate issue.
- **Three §2 surfaces need a manifest edit, which is the easiest kind to forget.**
  `packages/ui/package.json` exposes `"./components/*": "./src/components/ui/*.tsx"` and so cannot
  resolve `components/mentors/` or the new cross-surface time component; both need explicit entries.
  `packages/core` gains no subpath — `domain/` and `money/` are re-exported through `core/src/index.ts`.
- **§4 is wider than `.env.example`.** `BACKWARD_COMPATIBILITY.md` requires *both* zod schemas,
  `.env.example`, `README.md`, **`.github/workflows/ci.yml`** and **`tests/integration/environment.ts`**
  to move in the same PR as a new variable. Slices 1 and 4 each add variables and each owes all six.

**Security.** Three surfaces, in descending order of consequence:

1. **Invitation acceptance grants a role.** It is the only self-service role grant in the product, and
   R07 forbids any other. The mitigations are structural: acceptance requires a valid session, a
   verified persisted email equal to the normalized invitation email, and a token whose SHA-256 hash
   matches a unique-indexed row; the transaction locks that row, and the
   negative acceptance criterion ("a signed-in user finds no path to become a mentor") is asserted with
   `expectAbsent`. `risk-high`, second reviewer, per §3's rule for auth changes.
2. **The public projection.** `/m/<slug>` is enumerable by design. Every private field on
   `MentorProfile` — email, invitation and publish deadline — is
   excluded by allowlist and held there by a key-equality test (B24).
3. **Money.** Prices are integers in minor units, parsed exactly from major-unit decimal strings and
   bounded in the single platform currency. The client never supplies the amount charged by E03.
   `risk-high` on Slice 4, second reviewer.

**Currency remains a product confirmation, not hidden framework scope.** The smallest 1.0 design is
one platform currency with a proposed `USD` default; there is no per-mentor currency column or picker.
Founder A must confirm the currency and initial bounds before Slice 4 starts. Changing platform
currency after stored prices or bookings exist is a migration, not a config-only change.

**The framework risk.** Seventeen catalogued entries is an invitation to build seventeen abstractions.
The ship gate is the control and it was exercised: three candidates were rejected in review for
having a single caller. Which entries are most likely to be wrong, and what the exit is for each, is
recorded in Platform Primitives II's own Risks section rather than restated here.

**Rollback.** Each story is independently revertable while its dependants remain undeployed. Once a
later story depends on an earlier schema, rollback proceeds in reverse dependency order; that is an
ordinary deployment constraint, not a claim that the four stories form one inseparable release. Every
migration's `down` is exercised before merge. Publication itself has an application-level inverse:
`unpublish` hides the page while retaining its slug.

## 📝 Decisions in play

- **D08 / R07** — mentors join by invitation only; no open registration (founder A)
- **D18 / R17** — one bookable session within two weeks of accepting, batches of 20 (both founders)
- **D24 / R16** — the beachhead: English-speaking TypeScript, React, Python, AI-agent developers (founder A)
- **D21 / R13** — the list by stack tag and the share link; ordered by most recent published availability, never by a score (founder A)
- **N02 / R04** — no ratings or reviews; a link to public work and a plain description on every mentor page (founder A)
- **D09 / R08** — each mentor sets 25- and 50-minute prices within operator bounds (founder A)
- **D22 / R14** — mentors publish slots; a slot is bookable when it starts at least two hours later (founder A)
- **D01 / R01** — a session is 25 or 50 minutes (founder A)
- **D04 / R05** — Stripe only; Stripe Connect for payouts, onboarding before the first payout (founder A)
- **D19 / R18** — the operator is the two founders; by-hand actions logged in the shared note (both founders)
- **D11 / R10** — the platform fee is 20%, configurable by the operator (founder A)
- **D13 / D16** — E02 Slices 1–4 are the first iteration; Connect is separate 1.1 work; 1.0 ships
  2026-10-31

This design preserves the active decisions but exposes one conflict it cannot settle: D03/D13 require
a payable first iteration while R05's only payout channel is deferred. Q19 is therefore a
**production-launch blocker requiring a founder-approved answer or superseding decision**, not a task
the implementation may defer until money is already owed.

## 📝 Resolved in this spec

- **Spec shape** → this epic alone owns architecture, data model and cross-story contracts for four
  E02 stories. Thin story specs own their screens and acceptance criteria. Platform Primitives II is a
  non-normative index; Stripe Connect owns its separate 1.1 architecture.
- **The overlap hole** → handed to E03 with compatibility requirements only: immutable
  `Booking.slotId` and no overlapping active session. E03 owns the mechanism. E02 carries no fake
  booking relation or booking-dependent acceptance.
- **Currency shape** → one platform currency and one bounds set, with no per-mentor currency column.
  The proposed initial currency and bound values remain blocking founder decisions.
- **Frontend depth** → the three field types E02 collects, `LocalTime`, `ReadinessChecklist`, plus
  `useApiResource` + `ResourcePanel`. No declarative screen descriptor.
- **Invitation-validity mechanism** → a provisional 14-day `INVITATION_TTL_DAYS`, snapshotted per
  invitation, so changing the default never expires a link already in someone's inbox. It is a
  separate clock from R17's post-acceptance publish window. The value remains a non-blocking founder
  choice; the mechanism is settled.
- **Placeholder fields** → `headline`, `bio`, `yearsOfExperience` are kept; `bio` is reused as the
  product's plain description rather than creating a duplicate field.
- **Revoke and resend** → apply only to pending invitations. `resend` rotates the token hash and expiry
  atomically; neither operation reverses an accepted role grant.
- **Publication reversibility** → `unpublish` hides the page and slots but retains its immutable slug;
  republishing restores the same link.

## 📝 Deliberate departures from the filed issues

The issues were filed before this spec existed, so several of their implementation notes are superseded
here. Each is a deliberate choice, listed so a reviewer comparing spec to issue does not have to guess
which differences are decisions and which are mistakes.

| Issue said | This spec says | Why |
|---|---|---|
| #16, #17: `getMine`, `update`, `listMine`, `listPublicFor` | concept service methods with E01's injected scoped session | B23 removes route boilerplate through callbacks without imposing a second CRUD-shaped service interface |
| #16: the tag picker is a colocated component, since `CrudForm` has no multi-select | `multiselect` becomes a `CrudForm` field type (F5′) | Placement rule 2 beats rule 4 once the pattern is concept-agnostic; a checkbox group over `options` is a field type, not a mentor component. The copy button stays colocated under rule 4 |
| #16: `core/src/services/mentors/stack-tags.ts` | `core/src/domain/vocabularies/stack-tags.ts` | It is a vocabulary, not a mentor service; B25 makes the folder a cross-cutting sibling of `http/` |
| #15: the invitation page lives under `(mentor)/` | `app/invitation/[token]/page.tsx`, ungrouped | It is a public page opened by someone who is not yet a mentor; `(mentor)` is a guarded group |
| #15: possession of the link is enough to accept | acceptance also requires the persisted verified normalized user email to match the invitation | The invitation names a person; forwarding a URL must not transfer the mentor grant |
| #15: `accepted_by_id` unique | not unique | The unique constraint permanently spends a user's one acceptance and breaks the revoke-and-re-invite path the same issue implies |
| #16: `slug` reaches `not null` | nullable unique slug generated on first publish | Slice 1 can keep creating drafts; a database check makes every published row have a slug |
| #17: `Slot` carries a `booking` relation | `Slot` never owns one; E03 adds `Booking.slotId` | One slot can have several historical payment attempts and cancellations |
| #18: four scalar bound variables | `PLATFORM_CURRENCY` plus one `PLATFORM_PRICE_BOUNDS` object | One currency keeps 1.0 small without hiding the unit or bounds |
| #18: `isBookable(profile)` boolean | the `mentorOfferReady` readiness gate | It explains profile/price readiness without claiming that Checkout and settlement have launched |
| #17, #18: depend on #15 only | also depend on #16 | Both write to `MentorProfile` columns #16 creates, and both render on the page #16 publishes |
| #15: "constant-time hash compare" | lookup by hash | A random 256-bit token is located by its digest; no candidate hash comparison occurs |
| #17: per-slot locking | mechanism deferred to E03 | E02 has no Booking and cannot authoritatively choose E03's concurrency design |

## 📋 Phasing

Four slices, one PR each, each leaving the app working. Stripe Connect is linked 1.1 work with its own
spec and lifecycle; it is not Slice 5 of this epic.

- **Slice 1 — Invitation and role grant (#15).** `risk-high` (grants a role), `needs-qa`, second
  reviewer. Ships B5′, F8 and T1's invitation fixture. *Every later slice depends on it.*
- **Slice 2 — Mentor page and share link (#16).** `risk-high` (schema migration and a shared contract
  surface, `SDLC.md:97`), `needs-qa`, second reviewer. Ships B21′, B22, B23,
  B24, B25, F5′ `multiselect`, F10, T1's profile fixture. *The heaviest slice: it is where the
  domain floor lands.*
- **Slice 3 — Slots (#17).** `risk-high` (schema migration, `SDLC.md:97`), `needs-qa`, second reviewer.
  Ships B23's collection callback, B26 and F5′ `datetime`; booking occupancy remains E03.
- **Slice 4 — Prices and offer readiness (#18).** `risk-high` (money), `needs-qa`, second reviewer. Ships
  B12′, B16′, F5′ `money`. Blocked until the founders approve the platform currency and both bounds.

## 📋 Implementation Plan

Every step leaves the application building and booting. **Every new or changed production file,
without a spec-local exception, is added to `coverage.include` in the same change and reaches 100%
statements, branches, functions and lines.** That includes `page.tsx`, operational scripts and changed
generated primitives. Integration coverage supplements and never replaces unit coverage.

### Slice 1 — Invitation and role grant (#15)

1. **`token.service.ts`** — add `mintOpaqueToken` and `hashToken` (B5′). Tests: shape, length,
   determinism of the hash, distinctness across mints.
2. **`Invitation` entity + `invitations` migration** (`up` and `down`, exercised both ways),
   `MentorProfile.initialPublishDueAt`, the
   `CHECK`s named in the Data Model, and registration in `entities/index.ts`. Spike the `text[]`
   builder first — E01's spec flags it as unproven in MikroORM v7 and `stack_tags` depends on it.
3. **`config/env.ts`** gains `INVITATION_TTL_DAYS` (14) and `MENTOR_PUBLISH_WINDOW_DAYS` (14), both
   defaulted. §4 requires the same PR to update both zod schemas, `.env.example`, `README.md`,
   `.github/workflows/ci.yml` and `tests/integration/environment.ts`.
4. **`InvitationService`** — `create({ email, stackTags })` normalizes email, refuses an existing active
   mentor, enforces one unresolved invitation per address and returns the raw link once;
   `lookup(token, now)`, `accept(token, now)`
   inside `em.transactional` with the user-then-invitation lock order, `revoke(id)`, `resend(id)` with
   invitation locks. The service reads E01's injected session, reloads the persisted user,
   requires a verified normalized-email match, sets `acceptedAt`, `acceptedBy`, `publishDueAt`, calls
   `grantRole(user, 'mentor')`, creates the `MentorProfile` row **only when the user has none** (it is
   also the row E02-S02 later fills), sets `initialPublishDueAt` only when null, and emits
   `invitations.invitation.accepted`. Tests include case/whitespace normalization, unverified/mismatched
   email, consumed/expired/revoked/unknown, token rotation on resend, refusal to revoke an accepted
   invitation, existing mentor idempotence, concurrent create, accept versus revoke/resend, same-token
   acceptance and historical-token attempts.
5. **`ui/src/time/`** — `formatInstant` and `LocalTime` (F8). Test both renders: the first (server and
   first-client) output is the UTC label, and the post-mount effect swaps it to the viewer's zone.
6. **Routes** — `GET /api/invitations/[token]`, `POST …/accept` via `ownedAction` with no
   `role`. **The accept handler re-issues the session cookie** after the transaction commits, because
   `grantRole` bumps `session_version` and would otherwise sign the caller out. Tests per branch,
   including the identical `404` for unknown/expired/revoked/consumed, mismatch `403`, and an explicit test that the response
   carries a `Set-Cookie` whose `sv` matches the user's new `sessionVersion`.
7. **Pages and durable read** — `/invitation/[token]`, `GET /api/mentors/me/onboarding`, and `/mentor`
   showing the first publish-by deadline through `LocalTime` after redirect or refresh. Slice 1 uses
   existing feedback primitives; `ReadinessChecklist` ships with its B22 source in Slice 2.
8. **`scripts/invite.ts`** (R18) with `create`, `revoke` and `resend` subcommands, its own complete unit
   coverage, an `invite` npm script and README documentation. Each command requires an operator label
   and prints a token-free audit line for the shared note; only successful create/resend separately
   prints the raw link.
9. **Integration** — `tests/integration/invitations.integration.test.ts`: accept and land on `/mentor`
   with the due date **and still signed in** (the C1 regression); an unknown token shows "not valid";
   a signed-in user without an invitation has no path to become a mentor (`expectAbsent`, R07). Plus
   `seedPendingInvitation` (T1).

### Slice 2 — Mentor page and share link (#16)

1. **`core/src/domain/vocabulary.ts`** (B25) and `vocabularies/stack-tags.ts`. Tests cover the public
   interface; there is no SQL-string formatter in the domain layer.
2. **`core/src/domain/slug.ts`** (B21′) — `slugify`, `RESERVED_SLUGS`, `uniqueSlug`. Tests: diacritics,
   punctuation, empty normalization fallback, suffix-aware truncation, a reserved base and a collision
   chain. Service tests cover same-profile concurrency, the named-constraint-only retry, fresh outer
   transactions, the 100-attempt terminal conflict and publish-versus-unpublish serialization.
3. **`core/src/domain/readiness.ts`** (B22) — `defineReadiness`, `evaluate`, `assert`. Tests: all met,
   some met, none met, and the `fieldErrors` keying that `CrudForm` depends on.
4. **Public projections** (B24) — explicit `toPublicDto`/`toOwnerDto` construction plus the test-only
   key-equality helper; no production `project()` abstraction.
5. **`core/src/http/owned-route.ts`** (B23) — callback-based `makeOwnedResourceRoute` and `ownedAction`. Tests
   mirroring `makeCrudRoute.test.ts`'s shape. `apiHandler` remains the sole CSRF owner; callbacks may
   return a `Response` for cookie-bearing actions.
6. **`mentor-page` migration** + entity widening. `slug` is nullable and unique, while a database
   check makes publication imply a slug; `bio` is reused. The `stack_tags` CHECK carries its literal.
7. **`services/mentors/readiness.ts`** — `mentorPagePublishable`. **`MentorProfileService`** —
   owner read/update, `publish`, `unpublish`, `getPublicBySlug`, and the projections with their
   key-equality tests.
8. **Routes** — `GET/PUT /api/mentors/me`, `POST /api/mentors/me/{publish,unpublish}`, public
   `GET /api/mentors/[slug]`.
9. **`ui`** — `npx shadcn@latest add checkbox badge` in `packages/ui`; `CrudForm`'s `multiselect` type;
   `useApiResource` + `ResourcePanel` (F10). `/admin/users` is unrelated and remains unchanged.
10. **Pages** — `/mentor/profile` (form, tag picker, publish action, share link with copy) and
    `/m/[slug]` (public, Tailwind, via `components/mentors/MentorPageView.tsx`).
11. **Integration** — `mentor-page.integration.test.ts`: a signed-out visitor opens the share link and
    sees the public-work link and bio; publish/unpublish/republish retains one slug; concurrent equal
   names retry; `expectAbsent` covers rating/score/review/ranking. Plus
   `seedPublishedMentorProfile` (T1), whose name makes its non-null slug contract explicit.

### Slice 3 — Slots (#17)

1. **`Slot` entity + `availability-slots` migration** with the partial unique index and no booking relation.
2. **`validators/availability/slot-create.schema.ts`** validates an ISO instant only.
3. **`SlotService`** — owner list/publish/remove. `publish` uses the injected server clock to reject
   past instants and updates `lastPublishedAvailabilityAt` in the same transaction. E03 owns every
   booking-dependent read, conflict and concurrency rule.
4. **Routes** — `/api/availability/slots` (GET, POST) and `/[id]` (DELETE) through
   callback-based owned routes, whose remove callback receives the id from `params`.
5. **`ui`** — `CrudForm`'s `datetime` field with the local→UTC conversion under test.
6. **Pages** — `/mentor/slots`; the public page renders future slots and the lead-time state. Prices
   render separately in Slice 4; E03 later adds viable lengths and booking actions.
7. **Integration** — publish a slot and see it on the share page.

### Slice 4 — Prices and offer readiness (#18)

1. **`core/src/money/money.ts`** (B12′) — `Cents`, exact major-decimal parsing and `withinBounds`.
   Fee splitting remains #25's responsibility and R10 remains unchanged.
2. **`vocabularies/session-lengths.ts`**; after founder confirmation, `config/env.ts` gains
   `PLATFORM_CURRENCY` and `PLATFORM_PRICE_BOUNDS`, with the approved values as defaults; §4's six
   files move together. No `PLATFORM_FEE_PERCENT` lands before its first caller.
3. **`PlatformSettingsService`** (B16′) — `get`, `boundsFor`, with the misconfiguration rejection.
4. **`mentor-prices` migration** + entity; `mentorPricesUpdateSchema`;
   `MentorProfileService.updatePrices` (both prices together) and the `mentorOfferReady` gate.
5. **Route** `PUT /api/mentors/me/prices`; **`ui`** `CrudForm`'s `money` field; **page**
   `/mentor/prices` with the bounds as help text.
6. The public page shows both prices, or "not bookable yet" with no booking action; future availability
   may remain visible.
7. **Tests** — exact decimal conversion, input-length/range rejection, excess precision,
   inside/outside/missing bounds, and every
   offer-readiness state. `seedOfferReadyMentor` composes the Slice 2 profile and Slice 3 slot fixtures
   here without implying that the later payment launch gate is open.

## ✅ Acceptance criteria

**The per-story criteria live in the four story specs**, which own them; a copy here would be a third
transcription after the issue and the story spec, and it drifted within a day of being written. What
this document owns is the set that **no single story can assert**, because each spans slices or holds
across the whole epic:

- **A signed-in user finds no path to become a mentor.** (R07/D08, negative — the epic-wide invariant
  every slice must not break, asserted with `expectAbsent`.)
- **No mentor-facing or public screen shows a score, review, rating or ranking.** (N02/R04 and D21/R13,
  negative, asserted across every page E02 adds.)
- **Accepting an invitation leaves the mentor signed in**, holding both their previous roles and
  `mentor`. (Spans E01's session mechanism and E02-S01.)
- **A mentor who has completed every E02 gate has a ready offer**: page published, both prices inside
  bounds, at least one future slot, reachable by a signed-out visitor through the share link. Paid
  booking remains subject to the Q19 launch gate.
- **Nothing private crosses the public boundary**: the `/m/<slug>` payload contains no email, Stripe
  invitation or publish deadline. (Enforced by the
  key-equality projection tests.)
- **A price or policy change never moves an existing obligation.** (The architectural law: Slices 1 and
  4, asserted again by E03.)

## 📝 Open questions

- **Q19 — how first-iteration mentors are paid before Connect onboarding exists** (owner: founder A
  with founder B). D03/D13's payable first-iteration bar and R05's Stripe-only payout rule are not
  simultaneously implementable as written. **This blocks production launch of Checkout and collection
  of money**, not the four E02 preparation slices. The founders must either bring Connect + settlement
  into the iteration or approve a superseding payment decision.
- **Initial platform currency and price bounds** (owner: founder A). Proposed smallest scope: USD and
  one approved bounds object. Both values are **blocking before Slice 4 implementation**; placeholder
  money policy must not become a production default.
- **Whether the mentor's publish-by report is needed before #30** (owner: both founders). D18's check
  is "5 of the first 20 within two weeks", and until #30 the operator counts by hand from
  `publish_due_at` (R18). Non-blocking; the column makes the query one line.
- **Two product choices the brief does not cover** (owner: founder A, non-blocking for Slices 1–3).
  **Invitation validity** — 14 days is a plain choice with nothing behind it. **Slug immutability** — a
  share link that survives a rename is the reason, but a mentor who dislikes their slug currently has to
  ask an operator. If founder A wants self-service renaming, it needs a redirect-alias story.
- **A pre-existing §3 violation, not introduced here.** The repository's only migration,
  `Migration20260901142829.ts`, has no `down()`. Every migration in this spec ships both directions;
  the existing one should be fixed under its own issue.

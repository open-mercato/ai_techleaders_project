# DevMentor — Mentors Become Bookable (E02)

Date: 2026-09-08
Status: active — moves to `implemented/` when its five slices land
Issue: [#8](https://github.com/open-mercato/ai_techleaders_project/issues/8) — stories #15, #16, #17, #18, #19
Design authority: `.ai/specs/product-brief.md`, `.ai/specs/2026-09-01-engineering-standards.md`
Builds on: `.ai/specs/2026-09-04-accounts-and-roles.md` (E01), `.ai/specs/2026-09-04-platform-primitives.md`
Owns the domain floor through: `.ai/specs/2026-09-08-platform-primitives-ii.md`
Story specs: `2026-09-08-invitations.md`, `-mentor-page.md`, `-availability-slots.md`, `-mentor-prices.md`,
`-stripe-connect-onboarding.md` — each owns its acceptance criteria and screens; this document owns the
architecture, the data model, and every contract they share.

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

E02 turns an invited senior engineer into someone a mentee can pay: an invitation that grants the
mentor role, a public mentor page behind a share link, published slots, 25- and 50-minute prices
inside operator bounds, and Stripe Connect onboarding. It is also the epic where the repository's
*domain framework* is set, because ten of the backlog's twelve recurring feature archetypes have
their first consumer here. E01 built the request floor — session, errors, CSRF, clock. This spec
builds the domain floor on top of it, catalogued in Platform Primitives II, so E03–E05 configure
primitives instead of re-deriving them.

The two halves are coupled on purpose: every primitive has at least one real E02 production call
site, and three candidate primitives were rejected for having only one.

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
| **E02-S05** (#19) | External integration, second instance |

Three of these are already written three different ways in the filed issues — the "you cannot
publish / cannot be booked / cannot be paid until X" rule appears as a thrown `ValidationError` in
#16, a boolean `isBookable()` in #18, and prose in #19. Same computation, same screen, three
implementations. That is the concrete waste this spec removes.

### What E02 cannot defer

`MentorProfile` is the one table S02, S03, S04 and S05 all widen, and `Slot` is the table E03 books
against. Specified independently, the schema gets designed four times by four PRs. That is why this
epic document owns the data model even though each story keeps its own thin spec.

## 📝 Proposed Solution

Five slices, each one PR, each leaving the app working, ordered so each unblocks the next. Slices 1–4
are the first iteration (D13); Slice 5 is 1.1.

1. **Invitation and role grant (#15)** — `Invitation`, the accept transaction that adds `mentor`
   without removing a role, the by-hand `invite` script (R18), the mentor home with its publish-by
   date. *Unblocks every other slice: nothing else has a mentor to act as.*
2. **Mentor page and share link (#16)** — the real `MentorProfile` fields, the stack-tag vocabulary,
   the publish readiness gate, `/m/<slug>` for signed-out visitors.
3. **Slots (#17)** — `Slot`, publish and remove, the occupancy rule, the public page's slot list.
4. **Prices and bookability (#18)** — per-currency prices inside operator bounds, the settings
   service, the bookable gate the public page and E03-S02 both read.
5. **Stripe Connect onboarding (#19, 1.1)** — the payment port's Connect operations, both adapters,
   hosted onboarding, payout status visible to the mentor and the operator and to nobody else.

Underneath, seventeen primitive entries — six promoted from Primitives I's deferred list and eleven
new, of which two are deferred again — catalogued in `2026-09-08-platform-primitives-ii.md`. The ship gate is
unchanged and was applied strictly: a transactional single-use claim helper, an operator-command
harness, and a copy-link component were all **rejected** for having exactly one E02 caller.

One architectural law, stated with its evidence in Platform Primitives II and applied in three places
here:

> **Policy is read at the transition and snapshotted; it is never re-derived at read time.**

In E02 that means `Invitation.expiresAt` and `Invitation.publishDueAt` are stored instants written
when the invitation is created and accepted, never `INTERVAL` arithmetic in a query.

### Alternatives considered

- **Five independent story specs, no epic document** (what the issues literally ask for). Rejected:
  four of the five widen `MentorProfile`, and E03 books against `Slot`. Four PRs designing one table
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
- **Stripe Connect account links expire in minutes.** The URL is never stored; `start()` mints a
  fresh link on every click, and the return URL re-reads status rather than trusting the redirect.
  `requirements.currently_due` is what the mentor is shown, not a generic "incomplete".
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

No new package and no new boundary. New and changed files by package; `†` marks a primitive whose
contract is owned by Platform Primitives II.

```
packages/db/src/
  entities/invitations/invitation.entity.ts        Slice 1
  entities/availability/slot.entity.ts             Slice 3
  entities/mentors/mentor-profile.entity.ts      + slug, publicWorkUrl, description, stackTags,
                                                   publishedAt, lastPublishedAvailabilityAt   (Slice 2)
                                                 + price25Cents, price50Cents, currency        (Slice 4)
                                                 + stripeAccountId, payoutsEnabled,
                                                   payoutRequirements, connectSyncedAt         (Slice 5)
  entities/index.ts                              + Invitation, Slot in the `entities` array
packages/db/migrations/                          (a sibling of src/, not inside it)
  …-invitations.ts  …-mentor-page.ts  …-availability-slots.ts
  …-mentor-prices.ts  …-mentor-connect.ts                  (each with up AND down, §3)
  seeders/database.seeder.ts                     ~ Ada keeps `headline`, gains slug/tags/prices/a slot

packages/core/src/
  domain/readiness.ts                              † B22    (Slice 2)
  domain/vocabulary.ts                             † B25   (Slice 2)
  domain/vocabularies/{stack-tags,session-lengths,currencies}.ts   (Slices 2, 4)
  domain/slug.ts                                   † B21′   (Slice 2)
  money/money.ts                                   † B12′   (Slice 4)
  http/owned-route.ts                              † B23   (Slice 2)
  http/dto.ts                                      † B24   (Slice 2)
  services/auth/token.service.ts                 + † B5′ opaque pair                    (Slice 1)
  services/auth/user.service.ts                  ~ grantRole called by invitation accept (Slice 1)
  services/invitations/invitation.service.ts       Slice 1
  services/mentors/mentor-profile.service.ts       Slices 2, 4, 5
  services/mentors/readiness.ts                    the three gates                       (Slices 2, 4, 5)
  services/availability/slot.service.ts            Slice 3
  services/availability/occupancy.ts               the viable-length rule                (Slice 3)
  services/operator/platform-settings.service.ts   † B16′   (Slice 4)
  services/payments/payment-gateway.port.ts        † B14′   (Slice 5)
  services/payments/adapters/{stripe,mock}-payment-gateway.ts                            (Slice 5)
  services/payments/connect-onboarding.service.ts  Slice 5
  validators/mentors/{mentor-profile-update,mentor-prices-update}.schema.ts
  validators/availability/slot-create.schema.ts
  config/env.ts                                  + PLATFORM_FEE_PERCENT, PLATFORM_CURRENCIES,
                                                   PLATFORM_PRICE_BOUNDS (Slice 4),
                                                   INVITATION_TTL_DAYS,
                                                   MENTOR_PUBLISH_WINDOW_DAYS (Slice 1),
                                                   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Slice 5)
  container/{container,cradle}.ts                + one registration per new service
  events/event-map.ts                            + invitations.invitation.accepted,
                                                   mentors.profile.published,
                                                   availability.slot.published,
                                                   payments.connect_account.updated

packages/ui/src/
  time/{LocalTime.tsx,formatInstant.ts}            † F8  surface-agnostic — /m/<slug> uses it (Slice 1)
  backend/feedback/ReadinessChecklist.tsx          † F9     (Slice 1)
  backend/api/useApiResource.ts                    † F10    (Slice 2)
  backend/panels/ResourcePanel.tsx                 † F10    (Slice 2)
  backend/forms/CrudForm.tsx                     + multiselect, datetime, money field types † F5′
  components/ui/{checkbox,badge}.tsx               via `npx shadcn@latest add`             (Slice 2)
  components/mentors/MentorPageView.tsx            the public page body, shared by /m/<slug>

packages/app/src/app/
  (mentor)/mentor/page.tsx                       ~ the publish-by ask and readiness         (Slice 1)
  (mentor)/mentor/{profile,slots,prices,payouts}/page.tsx
  invitation/[token]/page.tsx                      public, ungrouped like m/[slug]   (Slice 1)
  m/[slug]/page.tsx                                Slice 2
  api/invitations/[token]/route.ts, …/accept/route.ts
  api/mentors/me/route.ts, …/publish/route.ts, …/prices/route.ts, …/payouts/route.ts
  api/mentors/[slug]/route.ts                      public read
  api/availability/slots/route.ts, …/[id]/route.ts
  api/payments/connect/{onboard,return}/route.ts   Slice 5
  admin/users/page.tsx                           ~ a Payouts column, operator-only          (Slice 5)

scripts/invite.ts                                  R18, run with tsx                        (Slice 1)
tests/integration/fixtures/mentor.ts               † T1
```

Three boundary facts this layout respects, all forced by `eslint.config.mjs` and the manifests:

- **`ui` never imports `core`.** The stack-tag picker cannot import the vocabulary; its options travel
  as a page prop. `ReadinessChecklist` takes plain items, not a `Readiness` type.
- **`core` never imports `next`.** `owned-route.ts` takes a plain `Request` and returns a `Response`;
  the `(mentor)` layout's guard uses `packages/app/src/lib/session.ts` from E01.
- **`db` is the leaf.** The occupancy rule is a pure function in `core`, not a SQL predicate, so it is
  unit-testable at the 100% bar without a database. It also means a migration cannot call a `core`
  helper — which is why the `stack_tags` CHECK literal and the `slug` backfill are hand-written SQL,
  with a `core`-side test guarding the drift (B25).

And one rule inherited from E01 that E02 must keep paying: **authorization is enforced at the page and
at the service, never at the layout alone.** App Router layouts do not re-render on client-side
navigation, so a guard living only in `(mentor)/layout.tsx` does not run when the router fetches
`/mentor/prices` as a segment. Each of E02's five mentor pages therefore calls
`requirePageRole('mentor')` itself, and each service method independently requires an authorized
`Session`. The layout guard stays for the redirect experience; it is not the boundary. This matters
most for `/mentor/payouts`, whose privacy is elsewhere justified by route construction — route
construction protects the *API*, not the page.

### The occupancy rule (the answer to the overlap hole)

`Slot` is a single start instant (#17, the plain reading of D22) and the *mentee* chooses 25 or 50
minutes at booking time (#21). Neither issue says what stops a mentor with slots at 14:00 and 14:30
from taking a 50-minute booking on the first and a 25-minute booking on the second. This spec fixes
the rule, because #17 would otherwise ship a model #21 has to change.

```ts
// packages/core/src/services/availability/occupancy.ts
export interface Interval { startsAt: Date; endsAt: Date }
export function viableLengths(
  slotStart: Date,
  occupied: readonly Interval[],
  lengths: readonly number[],       // SessionLengths, ascending
): number[];                        // the lengths whose [slotStart, slotStart+L) hits nothing
```

Two halves, deliberately not one:

- **At read time.** `listBookableFor(mentorProfileId, now)` returns each future, non-removed,
  unbooked slot together with `availableLengths`. A slot with an empty list is not offered at all.
  The public page and the slot picker show only the lengths that are actually still bookable.
- **At write time.** E03-S02's `start()` recomputes `viableLengths` inside the booking transaction
  and refuses with `ConflictError` if the requested length is no longer viable. Read-time filtering is
  a courtesy; the write path is the guarantee.

**Where the write path serialises, stated precisely, because the obvious answer is wrong.** Locking
*the slot row* does not prevent the overlap this rule exists to stop: two concurrent bookings on two
*different* slots — 14:00 and 14:30 — lock different rows, neither sees the other's uncommitted
booking, and both commit. The serialisation point is the **mentor**, not the slot. Two mechanisms,
and E03 should use both:

1. `SELECT … FOR UPDATE` on the `mentor_profiles` row at the top of the booking transaction, so all
   booking creation for one mentor is serialised. Contention is per-mentor and negligible at 1.0
   volume.
2. A PostgreSQL exclusion constraint on `bookings` —
   `EXCLUDE USING gist (mentor_profile_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('pending','confirmed'))`
   — which makes the overlap impossible at the storage layer regardless of application code. It needs
   `btree_gist` and an `ends_at` column (or a generated one) on `bookings`.

This is recorded here rather than in E03 because it is the *reason* the slot model survives: E02 ships
a `Slot` whose safety depends on a constraint E03 must add, and an E03 author who reaches for a
per-slot lock will believe they have solved it. The exclusion constraint is the durable guarantee; the
row lock is what turns a constraint violation into a clean `ConflictError` instead of a race.

`occupied` is built from **confirmed bookings and unexpired pending ones** — mirroring #21's existing
per-slot rule, widened from "this slot" to "any overlapping window". In E02 there is no `Booking`
entity, so `listBookableFor` passes an empty array and every slot offers both lengths. That is not a
stub: `viableLengths` has a real production call site in Slice 3 and carries its full boundary test
matrix (exact touch at both ends, containment, a slot with only 25 left, a slot with nothing left);
E03 supplies real intervals without changing a signature.

**Why not the two simpler options.** Refusing to publish two slots less than 50 minutes apart is one
comparison, but it forbids a dense 25-minute grid a mentor may legitimately want, and it is a rule
the mentor experiences as arbitrary. Letting the mentor fix the length per slot is the cleanest data
model and contradicts #21's acceptance criterion that the mentee chooses — it would need founder A to
supersede part of D09/R01, which is not this spec's to do. The cost of the chosen rule is honest and
recorded: a neighbouring slot can become unbookable while a mentee is looking at it, so the picker
refetches on focus and `start()` returns a `ConflictError` the picker renders in place.

## 📝 Data Model

Five additive migrations, each with `up` **and** `down` (§3), each generated from the entity diff.
Every entity uses `defineEntity` + `p` builders inside `defineSingletonEntity`, keeps `baseProperties`,
and is added by hand to the `entities` array in `packages/db/src/entities/index.ts`.

### `invitations` — Slice 1 (new)

| Column | Type | Notes |
|---|---|---|
| `email` | `varchar(255)` not null | the invited address; **not** unique — a re-invite after expiry is a new row |
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

**`accepted_by_id` is deliberately not unique.** A unique constraint reading "one accepted invitation
per user" is the obvious choice and it breaks the recovery path this spec documents: someone accepts on
the wrong account, the operator revokes and re-invites, and the correct person — who may be the same
account — can never accept again, because the slot is spent forever. A user may legitimately hold more
than one accepted invitation over time. What must be idempotent is the *effect*, and it is:
`grantRole` is set-based, and `accept` creates a `MentorProfile` only when the user has none.

### `mentor_profiles` — Slices 2, 4, 5 (widened)

| Column | Type | Slice | Notes |
|---|---|---|---|
| `slug` | `varchar(60)` not null, **unique** | 2 | added nullable, backfilled, then set not-null **inside one migration** — see below |
| `public_work_url` | `text` null | 2 | R04; validated `z.string().url()` with an `https?:` protocol check |
| `description` | `text` null | 2 | R04; 1–2000 chars |
| `stack_tags` | `text[]` not null default `'{}'` | 2 | `CHECK` with the same hand-written literal (R16, D21) |
| `published_at` | `timestamptz` null | 2 | non-null ⇒ the page is public |
| `last_published_availability_at` | `timestamptz` null | 2 | B26; maintained by Slice 3, read by #20 (R13) |
| `price_25_cents` | `integer` null | 4 | minor units; `CHECK > 0` |
| `price_50_cents` | `integer` null | 4 | minor units; `CHECK > 0` |
| `currency` | `char(3)` not null default `'USD'` | 4 | in `PLATFORM_CURRENCIES`; two-decimal only (B12′) |
| `stripe_account_id` | `varchar(255)` null, **unique** | 5 | |
| `payouts_enabled` | `boolean` not null default `false` | 5 | |
| `payout_requirements` | `jsonb` null | 5 | Stripe's `requirements.currently_due`, stored as received |
| `connect_synced_at` | `timestamptz` null | 5 | when the status above was last read |

**`slug` becomes `not null` inside Slice 2's own migration, not in a later PR.** Expand-then-contract
exists to avoid a window where live rows violate a new constraint; here the whole population is one
seeded row (Ada), so `up()` adds the column nullable, backfills it with a SQL expression, and sets
`not null` — three statements, one migration, one `down()`. Splitting it would leave `slug` nullable
while every read path (`/m/<slug>`, the share link, `uniqueSlug`'s collision check) assumes it is
present, and would leave the contract half owned by no slice. There are five migrations in E02, not six.

The backfill runs in SQL rather than through `uniqueSlug`: `packages/db/**` may not import
`@devmentor/core` (`eslint.config.mjs:44-48`), so a migration cannot call a `core` helper. Post-backfill
uniqueness is guaranteed by the unique index, and Slice 2's seeder sets Ada's slug explicitly.

`headline`, `bio` and `yearsOfExperience` are **kept**. `BACKWARD_COMPATIBILITY.md` lists them under
"what is not protected", but `database.seeder.ts` and `tests/integration/admin.integration.test.ts`
both assert `Systems & algorithms mentor`; retiring them is a separate expand-then-contract PR with
no product value in E02 (#16's open question, answered: keep).

**The three prices/currency columns move together.** Currency is never updated alone: an
`updatePrices` call always carries `{ currency, price25Cents, price50Cents }` and validates all three
against that currency's bounds in one transaction. A currency change with stale prices would silently
reprice a mentor by an order of magnitude, and there is no partial state where it can.

### `slots` — Slice 3 (new)

| Column | Type | Notes |
|---|---|---|
| `mentor_profile_id` | `uuid` not null, FK, `on delete cascade` | |
| `starts_at` | `timestamptz` not null | an instant, always UTC (B1) |
| `removed_at` | `timestamptz` null | the mentor's own removal; kept, not deleted, so E03 can explain a vanished slot |
| `booking_id` | — | **not created by E02.** Designed here (nullable, unique, FK `bookings`) so E03-S03 adds a column rather than a design |

Unique index on `(mentor_profile_id, starts_at)` where `removed_at is null` — a partial unique index,
so a removed 14:00 slot does not block republishing 14:00. Index on
`(mentor_profile_id, starts_at)` for the read path.

**Slice 3 creates neither the column nor the entity property**, and the distinction matters. MikroORM
maps every declared property to a column and puts it in the generated `SELECT`, so a `Slot` entity
carrying a `booking` property with no `booking_id` column would make every read of `slots` fail at
runtime and would regenerate the column on the next `db:migration:create` diff against the committed
snapshot. E03-S03 adds the column, the foreign key and the property together, in one migration.

What E02 *does* ship is the design above and a `listBookableFor` predicate written to accommodate it —
so E03 adds a column, not a decision.

### Sensitive data

`token_hash` is a hash, never the token; the raw invitation token exists only in the emitted link and
in the `invite` script's stdout. `stripe_account_id` and `payout_requirements` are operator/owner data
and appear in no public projection — enforced by B24's key-equality tests, listed explicitly in the
primitives catalogue. An invited person's email address appears on the public invitation page only
after the token has been presented, and never in a list.

## 📝 API Contracts

Every route is wrapped in `apiHandler` (directly or through a factory), returns the `{ ok, data }` /
`{ ok, error }` envelope (§1), and exports `dynamic = 'force-dynamic'` where it touches the database.
Owner routes are built with `makeOwnedResourceRoute` / `makeOwnedCollectionRoute` / `ownedAction`
(B23), which apply `requireSession(req, cradle)` → `requireRole` (when a role is given) →
`requireCsrfHeader` **on state-changing verbs only**. A `GET` is never CSRF-checked: the header does
nothing on a read and would break a browser-navigated link.

| Route | Method | Auth | Body / query | Answer |
|---|---|---|---|---|
| `/api/invitations/[token]` | GET | public | — | `{ email, stackTags, expiresAt }`, or `404 not_found` |
| `/api/invitations/[token]/accept` | POST | session + CSRF, **no role** | — | `{ roles, publishDueAt }` **+ a re-issued session cookie**, `404` unknown/expired/revoked, `409` already accepted by the caller |
| `/api/mentors/me` | GET, PUT | `mentor`; CSRF on `PUT` | `mentorProfileUpdateSchema` | owner DTO incl. `readiness` |
| `/api/mentors/me/publish` | POST | `mentor` + CSRF | — | owner DTO, or `422` with `fieldErrors` from the readiness gate |
| `/api/mentors/me/prices` | PUT | `mentor` + CSRF | `mentorPricesUpdateSchema` | owner DTO, or `422` naming the breached bound |
| `/api/mentors/me/payouts` | GET | `mentor` | — | `{ payoutsEnabled, requirements, readiness }` |
| `/api/mentors/[slug]` | GET | **public** | — | public DTO; slots as `{ id, startsAt, availableLengths, withinLead }`, `404` if unpublished |
| `/api/availability/slots` | GET, POST | `mentor`; CSRF on `POST` | `slotCreateSchema` | the mentor's slots / the created slot |
| `/api/availability/slots/[id]` | DELETE | `mentor` + CSRF | — | `{ id }`, `409` if booked |
| `/api/payments/connect/onboard` | POST | `mentor` + CSRF | — | `{ url }` (a fresh account link), `503` if Stripe is unconfigured |
| `/api/payments/connect/return` | GET | `mentor`, **browser-navigated** | — | 302 to `/mentor/payouts` after re-reading status |

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

Two further contract rules carried from E01 and applied here without exception:

- **`/api/payments/connect/return` is navigated, not fetched**, so it catches its own failures and
  redirects with a query flag rather than rendering a JSON envelope in the browser. It **writes**
  (`payouts_enabled`, `connect_synced_at`) on a `GET` with no CSRF header — a deliberate exception with
  a stated reason: a browser-navigated return URL cannot carry a custom header, and the write is an
  idempotent re-read of Stripe's own status for the caller's own account, so there is nothing an
  attacker can cause but a refresh of the truth. A session is still required; a return with no session
  redirects to `/sign-in?returnTo=/mentor/payouts`, and the webhook keeps the status correct anyway.
- **`GET /api/mentors/[slug]` is public and therefore a projection boundary.** It returns
  `toPublicDto` and nothing else; the key-equality test is what keeps it that way.

Shared schemas in `core/src/validators/`, imported by both the route and `CrudForm`:

```ts
// Every field is optional: a mentor saves incrementally, and completeness is the publish gate's job,
// not the schema's. Making these required would make `mentorPagePublishable` unreachable through the
// only screen that writes them — and with it, #16's "the missing link is named" acceptance criterion.
mentorProfileUpdateSchema = { publicWorkUrl: z.string().url().refine(https-or-http).optional(),
                              description: z.string().min(1).max(2000).optional(),
                              stackTags: z.array(StackTags.schema).max(4).optional() }
mentorPricesUpdateSchema  = { currency: Currencies.schema,
                              price25Cents: z.number().int().positive(),
                              price50Cents: z.number().int().positive() }   // bounds checked in the service
slotCreateSchema          = { startsAt: z.string().datetime() }             // shape only: past-check and
                                                                            // the two-hour lead live in the service
```

**Where each kind of rule lives, because the split is load-bearing.** *Shape* is the schema's job and
is checked identically on both sides: is this a URL, is this an ISO instant, is this a member of the
vocabulary. *Completeness* is the readiness gate's job at the transition that requires it — which is
why `mentorProfileUpdateSchema` is entirely optional fields. *Policy that needs server state* — the
price bounds, the two-hour lead, whether `now` is past a slot — is the service's job, never the
schema's: a shared schema that rejects a past instant validates the same payload differently at
different moments and against a client clock the server does not trust.

Bounds are checked in the service, not the schema, because the schema is shared with the client and
the bounds come from a service the client cannot call. The form receives the bounds as props and
shows them as help text; the server is the authority.

**Error codes** — all existing (§1): `404 not_found` for an unknown, expired or revoked invitation and
for an unpublished slug; `409 conflict` for a second acceptance and for removing a booked slot;
`422 validation_failed` with `fieldErrors` for a failed readiness gate or a breached bound;
`503 service_unavailable` (E01's addition) when Stripe is unconfigured.

**One deliberate information choice.** An unknown token, an expired token and a revoked token all
answer `404` with the same message — *"This invitation is not valid."* Distinguishing them would tell
an enumerator which of their guesses had once been real. The operator can see the difference in the
database; the visitor cannot.

### Domain events (§6, all additive)

`invitations.invitation.accepted` `{ invitationId, userId, publishDueAt }`,
`mentors.profile.published` `{ mentorProfileId, slug }`,
`availability.slot.published` `{ mentorProfileId, slotId, startsAt }`,
`payments.connect_account.updated` `{ mentorProfileId, payoutsEnabled }`.
In-process only, subscribers log; the bus swallows handler failures, so nothing durable rides on them
(Primitives I B15's rule).

## 📝 UI/UX

**Per-screen detail lives in the five story specs**, which own the screens by the division of labour at
the top of this document. What follows is only what is cross-cutting or would otherwise be decided five
times.

**Surfaces.** Per the three-surface taxonomy (Primitives I F1): `/m/<slug>` and `/invitation/<token>`
are **public** Tailwind pages; every `(mentor)/*` screen is **app** surface — shadcn inside `AppShell`.
`/admin/users` stays **admin**.

**The mentor home is the spine of D18's experiment**, and it is the one screen no single story owns —
it aggregates all four. It renders one `ReadinessChecklist` titled with the ask R17 requires,
*"Publish at least one bookable session by <date>"*, the date through `LocalTime`, and its items are
the union of the page gate, the price gate and "at least one future slot". Everything the mentor still
has to do is on one screen, each item linking to the screen that fixes it. This is the concrete reason
B22 and F9 exist rather than three bespoke `if`s.

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
| The same invitation link is opened twice | The first grants `mentor`; the second answers `409` and the page says it was already accepted |
| Two tabs accept the same invitation simultaneously | The accept transaction locks the row; one wins, the other gets `409`. No second `grantRole` |
| An accepted invitation's user already holds `mentor` | Idempotent: `grantRole` is additive and set-based; no duplicate role, no second `MentorProfile` |
| An invitation is opened by a user who is signed in as someone else | It grants `mentor` to **the signed-in account**, and the page says which account before the button. Accepting on the wrong account is the realistic mistake; the operator can revoke and re-invite |
| An expired or revoked link | `404`, one sentence, no account touched — and indistinguishable from an unknown token |
| A mentor publishes with no public-work link | `422`, `fieldErrors.publicWorkUrl`, the checklist item stays unmet |
| Two mentors named "Ada Lovelace" | `uniqueSlug` yields `ada-lovelace-2`; reserved words are treated as taken (the list is `RESERVED_SLUGS` in B21′) |
| A mentor renames themselves after publishing | The slug does not move; printed share links keep working |
| A slot is published in the past, or inside two hours | The schema rejects a past instant. A slot inside the two-hour lead is returned by `listBookableFor` with `withinLead: true` and **shown disabled with the reason**, not hidden — the lead is evaluated against `now` at read time, so a slot published for 18:00 becomes bookable as the day passes (R14) |
| A mentor removes a booked slot | `409 conflict` — *"This slot is booked; cancel the booking instead"* (R09) |
| A mentor publishes 14:00 and 14:30, and 14:00 is booked for 50 minutes | 14:30 stops being offered — `viableLengths` returns empty. 13:30 keeps offering 25 minutes only |
| A slot becomes unbookable while a mentee is looking at it | The picker refetches on focus; `start()` re-checks in its transaction and returns `409`, rendered in place |
| A price is saved outside the bounds | `422` naming the bound that was breached, per length and currency |
| A price is saved in a currency with no configured bounds | `422` from `boundsFor` — never a silent pass |
| A mentor changes a price after a booking exists | The booking keeps its snapshotted price (E03); nothing recomputes |
| The mentor page is published but unpriced | The public page says "not bookable yet"; no slot is offered; E03-S02 refuses a booking on the `mentorBookable` gate |
| Stripe is unconfigured | Connect routes answer `503`; the app builds, boots and serves every public page. The payouts screen says onboarding is not available yet |
| A Connect account link is opened after it expires | Stripe shows its own expiry page; the mentor returns and clicks again, which mints a fresh link. No URL is ever stored |
| `account.updated` is delivered twice | Applied once, through the webhook inbox (Primitives I B13, `DEFER #22`, whose `account.updated` branch B13 names as #33) keyed on the event id |
| The webhook never arrives | `/api/payments/connect/return` re-reads status on return, and the payouts page re-reads on load. The webhook is the fast path, not the only path |
| The database is unreachable | Public pages and the build are unaffected; every `force-dynamic` mentor route degrades per the existing rule |

## 📝 Risks & Impact Review

**Blast radius.** Everything is additive. The exceptions, each named with its mitigation:

- **`MentorProfile` gains thirteen columns across three of the five migrations.** `headline` stays, so
  `database.seeder.ts` and `admin.integration.test.ts:38`'s `Systems & algorithms mentor` assertion
  keep passing (`:22` asserts `link "Users"`, which Slice 2's `ResourcePanel` migration must preserve). `slug` reaches `not null` by expand-then-contract in a later PR, not in Slice 2.
- **`/admin/users/page.tsx` gains a Payouts column and moves onto `ResourcePanel`.** The integration
  test asserts `heading "Users"` and three `cell` strings; the migration preserves them or updates the
  test in the same PR.
- **The `entities` array changes twice (`Invitation`, `Slot`) and the committed
  `.snapshot-devmentor.json` changes with all five migrations.** Each
  migration ships `up` and `down` and is exercised both ways (§3), which the repository's single
  existing migration does **not** do — `Migration20260901142829.ts` has no `down()`. That is a
  pre-existing §3 violation this spec does not inherit and does not fix; it is worth a separate issue.
- **Three §2 surfaces need a manifest edit, which is the easiest kind to forget.**
  `packages/ui/package.json` exposes `"./components/*": "./src/components/ui/*.tsx"` and so cannot
  resolve `components/mentors/` or the new `ui/src/time/`; both need entries. `packages/core` gains no
  subpath — `domain/` and `money/` are re-exported through `core/src/index.ts`. And `UserDto` plus
  `GET /api/users` gain a payouts field for the operator's column, both §1/§2 protected surfaces,
  additive, landing with Slice 5.
- **§4 is wider than `.env.example`.** `BACKWARD_COMPATIBILITY.md` requires *both* zod schemas,
  `.env.example`, `README.md`, **`.github/workflows/ci.yml`** and **`tests/integration/environment.ts`**
  to move in the same PR as a new variable. Slices 1, 4 and 5 each add variables and each owes all six.

**Security.** Three surfaces, in descending order of consequence:

1. **Invitation acceptance grants a role.** It is the only self-service role grant in the product, and
   R07 forbids any other. The mitigations are structural: acceptance requires a valid session *and* a
   token whose SHA-256 hash matches a unique-indexed row, the transaction locks that row, and the
   negative acceptance criterion ("a signed-in user finds no path to become a mentor") is asserted with
   `expectAbsent`. `risk-high`, second reviewer, per §3's rule for auth changes.
2. **The public projection.** `/m/<slug>` is enumerable by design. Every private field on
   `MentorProfile` — email, Stripe account id, payout requirements, invitation, publish deadline — is
   excluded by allowlist and held there by a key-equality test (B24).
3. **Money.** Prices are integers in minor units, recomputed server-side, and bounded per currency;
   the client never supplies an amount. `risk-high` on Slice 4 and Slice 5, second reviewer.

**The per-currency decision has a cost this spec accepts rather than hides.** Storing currency per
mentor makes bounds a per-currency map, makes every future comparison currency-aware, and makes a
zero-decimal currency (JPY) a code change rather than a config change — recorded in B12′ and enforced
by restricting the `Currencies` vocabulary. With `PLATFORM_CURRENCIES=USD` in 1.0 the runtime
behaviour is identical to a single-currency design; what has been bought is that adding EUR later is
a settings change plus a bounds entry, not a schema migration on live money data.

**Specifying the whole `PaymentGateway` port in Slice 5 pre-empts part of #34.** The boundary is
written into B14′: E02-S05 owns the three Connect signatures and their implementations; #34 owns
`CheckoutInput`, `GatewayEvent` and the Checkout implementations and may refine them freely, because
no E02 code calls them. What #34 may not do is declare a second port. Whichever ships first creates
the file.

**The framework risk.** Seventeen catalogued entries is an invitation to build seventeen abstractions.
The ship gate is the control and it was exercised: three candidates were rejected in review for
having a single caller. Which entries are most likely to be wrong, and what the exit is for each, is
recorded in Platform Primitives II's own Risks section rather than restated here.

**Rollback.** Each slice is one PR and independently revertable, in reverse order. Reverting Slice 2
after Slice 3 has shipped would strand `Slot` rows against a profile with no `slug`; the slices are
therefore reverted as a stack, and each migration's `down` is exercised before merge.

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
- **D13 / D16** — Slices 1–4 are the first iteration; Slice 5 is 1.1; 1.0 ships 2026-10-31

Nothing here contradicts an active decision, and no superseding record is proposed. **Three choices
below are not covered by the brief at all** — currency, invitation validity and slug immutability — and
are listed under Open questions for founder A to ratify rather than presented as settled product.

## 📝 Resolved in this spec

- **Spec shape** → one epic document owning architecture, data model and contracts, plus five thin
  story specs owning acceptance criteria and screens. The five filenames the issues ask for are kept.
- **The framework's home** → a companion catalogue, `2026-09-08-platform-primitives-ii.md`, so
  Primitives I's E01 ship gate stays readable and E03–E05 have something to be pointed at.
- **The overlap hole** → resolved at booking confirmation, via `viableLengths` at read time and a
  re-check inside the booking transaction. `Slot` stays a single start instant, and #21's "the mentee
  chooses 25 or 50" survives intact.
- **Currency** → per mentor profile, with bounds as a per-currency map and the `Currencies` vocabulary
  restricted to two-decimal currencies in 1.0. *(An engineering decision on a product question the
  brief does not record — see Open questions.)*
- **Frontend depth** → the three field types E02 collects, `LocalTime`, `ReadinessChecklist`, plus
  `useApiResource` + `ResourcePanel`. No declarative screen descriptor.
- **E02-S05 (Stripe Connect)** → specified in full now, including the whole `PaymentGateway` port
  surface, with an explicit ownership boundary against #34.
- **Invitation validity** → 14 days (`INVITATION_TTL_DAYS`), snapshotted per invitation, so changing
  the default never expires a link already in someone's inbox. Note this is a *second* fourteen-day
  clock, unrelated to R17's post-acceptance publish window; they are separate variables on purpose.
  *(Also a product question the brief does not record — see Open questions.)*
- **Placeholder fields** → `headline`, `bio`, `yearsOfExperience` are kept; retiring them is a
  separate expand-then-contract PR with no product value here.
- **Revoke and resend** → added to `InvitationService` in Slice 1, because an operator sending 20 by
  hand (R18) will get an address wrong inside the first batch.

## 📝 Deliberate departures from the filed issues

The issues were filed before this spec existed, so several of their implementation notes are superseded
here. Each is a deliberate choice, listed so a reviewer comparing spec to issue does not have to guess
which differences are decisions and which are mistakes.

| Issue said | This spec says | Why |
|---|---|---|
| #16, #17: `getMine`, `update`, `listMine`, `listPublicFor` | `getForOwner`, `updateForOwner`, `listForOwner`, `listBookableFor` | The first three are B23's service interfaces, which take a `Session`. `listPublicFor` → `listBookableFor` because the method now returns *bookability*, not merely public visibility |
| #16: the tag picker is a colocated component, since `CrudForm` has no multi-select | `multiselect` becomes a `CrudForm` field type (F5′) | Placement rule 2 beats rule 4 once the pattern is concept-agnostic; a checkbox group over `options` is a field type, not a mentor component. The copy button stays colocated under rule 4 |
| #16: `core/src/services/mentors/stack-tags.ts` | `core/src/domain/vocabularies/stack-tags.ts` | It is a vocabulary, not a mentor service; B25 makes the folder a cross-cutting sibling of `http/` |
| #15: the invitation page lives under `(mentor)/` | `app/invitation/[token]/page.tsx`, ungrouped | It is a public page opened by someone who is not yet a mentor; `(mentor)` is a guarded group |
| #15: `lookup` treats an accepted invitation as `NotFoundError` | `404` for everyone **except** the account that accepted it, which gets `409` and "you already accepted this" | A uniform 404 tells the actual invitee nothing actionable. Scoping the 409 to the acceptor keeps the enumeration answer uniform for everyone else |
| #15: `accepted_by_id` unique | not unique | The unique constraint permanently spends a user's one acceptance and breaks the revoke-and-re-invite path the same issue implies |
| #16: `slug` reaches `not null` by expand-then-contract in a later PR | nullable → backfill → `not null` inside one migration | One seeded row; splitting it leaves the contract half owned by no slice |
| #17: `Slot` carries a `booking` relation from the start | no `booking` property until E03-S03 | A declared property with no column breaks every read of `slots` |
| #18: `PRICE_MIN_25_CENTS` … four scalar variables | one `PLATFORM_PRICE_BOUNDS` JSON variable | Per-currency bounds would otherwise be a combinatorial explosion of names |
| #18: `isBookable(profile)` boolean | the `mentorBookable` readiness gate | A boolean cannot answer *why not*, which three screens need |
| #19: three Connect columns | four (`connect_synced_at`) and `createAccountLink` returns `{ url, expiresAt }` | Account links expire in minutes; the page must know when the status was last read |
| #17, #18: depend on #15 only | also depend on #16 | Both write to `MentorProfile` columns #16 creates, and both render on the page #16 publishes |
| #19: depends on #15 | also on #34's webhook inbox | For the fast path only; the return-URL re-read keeps it correct without it |
| #15, #17: "constant-time hash compare", per-slot locking | lookup by hash; serialise on the mentor row | Both explained in full where they appear (B5′, the occupancy rule) |

## 📋 Phasing

Five slices, one PR each, each leaving the app working. Slices 1–4 land before D16's 2026-10-31 ship
date; Slice 5 is 1.1.

- **Slice 1 — Invitation and role grant (#15).** `risk-high` (grants a role), `needs-qa`, second
  reviewer. Ships B5′, F8, F9, T1's invitation fixture. *Every later slice depends on it.*
- **Slice 2 — Mentor page and share link (#16).** `risk-high` (schema migration and a shared contract
  surface, `SDLC.md:97`), `needs-qa`, second reviewer. Ships B21′, B22, B23,
  B24, B25, B26, F5′ `multiselect`, F10, T1's mentor fixture. *The heaviest slice: it is where the
  domain floor lands.*
- **Slice 3 — Slots (#17).** `risk-high` (schema migration, `SDLC.md:97`), `needs-qa`, second reviewer.
  Ships the occupancy rule, B23's collection factory and F5′ `datetime`.
- **Slice 4 — Prices and bookability (#18).** `risk-high` (money), `needs-qa`, second reviewer. Ships
  B12′, B16′, F5′ `money`.
- **Slice 5 — Stripe Connect onboarding (#19, 1.1).** `risk-high` (money, data scoping), `needs-qa`,
  second reviewer. Ships B14′ and both adapters. Depends on #34's webhook inbox for the fast path.

## 📋 Implementation Plan

Every step leaves the application building and booting. Every step that adds or changes a production
file **adds it to `coverage.include` in `vitest.config.mts` in that step** and carries unit tests to
100% statements / branches / functions / lines for that file. Today that list contains exactly one file
(`packages/core/src/http/makeCrudRoute.ts`), so every addition below is the first time its file is
measured. Integration coverage supplements and never replaces this.

**What is in scope for that rule, stated once so ten steps do not each decide.** In: every file under
`packages/{core,db,ui}/src` this spec adds or changes, and every `route.ts`. Out, with the reason:
shadcn-generated primitives in `ui/src/components/ui/` (generated, never hand-written — `button.tsx`
and `card.tsx` are already outside the list); `page.tsx` server components whose whole body is a guard
call plus a component (their behaviour is asserted by the integration scenarios, and the components
they render are themselves in scope); and `scripts/invite.ts`, which lies outside
`vitest.config.mts`'s `packages/**` include glob — it is covered by extracting its logic into
`InvitationService.create`, which *is* in scope, leaving the script as argument parsing and a
`console.log`. Any `page.tsx` containing a branch is in scope like anything else.

### Slice 1 — Invitation and role grant (#15)

1. **`token.service.ts`** — add `mintOpaqueToken` and `hashToken` (B5′). Tests: shape, length,
   determinism of the hash, distinctness across mints.
2. **`Invitation` entity + `invitations` migration** (`up` and `down`, exercised both ways), the
   `CHECK`s named in the Data Model, and registration in `entities/index.ts`. Spike the `text[]`
   builder first — E01's spec flags it as unproven in MikroORM v7 and `stack_tags` depends on it.
3. **`config/env.ts`** gains `INVITATION_TTL_DAYS` (14) and `MENTOR_PUBLISH_WINDOW_DAYS` (14), both
   defaulted. §4 requires the same PR to update both zod schemas, `.env.example`, `README.md`,
   `.github/workflows/ci.yml` and `tests/integration/environment.ts`.
4. **`InvitationService`** — `create({ email, stackTags })` returning the raw link once,
   `lookup(token, now)`, `accept(token, session, now)` inside `em.transactional` with the row locked,
   `revoke(id)`, `resend(id)`. `accept` sets `acceptedAt`, `acceptedBy`, `publishDueAt`, calls
   `grantRole(user, 'mentor')`, creates the `MentorProfile` row **only when the user has none** (it is
   also the row E02-S02 later fills), and emits `invitations.invitation.accepted`. Register in
   `container.ts`/`cradle.ts`. Tests: accept once, a second accept by the same caller `409`, expired,
   revoked, unknown, tags outside the vocabulary, a user who already holds `mentor` (idempotent — no
   duplicate role, no second profile), and the concurrent-accept path.
5. **`ui/src/time/`** — `formatInstant` and `LocalTime` (F8). Test both renders: the first (server and
   first-client) output is the UTC label, and the post-mount effect swaps it to the viewer's zone.
6. **Routes** — `GET /api/invitations/[token]` (public) and `POST …/accept` via `ownedAction` with no
   `role`. **The accept handler re-issues the session cookie** after the transaction commits, because
   `grantRole` bumps `session_version` and would otherwise sign the caller out. Tests per branch,
   including the identical `404` for unknown/expired/revoked, and an explicit test that the response
   carries a `Set-Cookie` whose `sv` matches the user's new `sessionVersion`.
7. **`ui/src/backend/feedback/ReadinessChecklist.tsx`** (F9) — items, hints, accessible state.
8. **Pages** — `/invitation/[token]` (public, Tailwind) and `/mentor` showing the publish-by ask
   through `ReadinessChecklist` + `LocalTime`.
9. **`scripts/invite.ts`** (R18) with an `invite` npm script, documented in `README.md` (§5, additive).
10. **Integration** — `tests/integration/invitations.integration.test.ts`: accept and land on `/mentor`
   with the due date **and still signed in** (the C1 regression); an unknown token shows "not valid";
   a signed-in user without an invitation has no path to become a mentor (`expectAbsent`, R07). Plus
   `seedPendingInvitation` (T1).

### Slice 2 — Mentor page and share link (#16)

1. **`core/src/domain/vocabulary.ts`** (B25) and `vocabularies/stack-tags.ts`. Tests: every member of
   the returned interface, including `sqlValueList`.
2. **`core/src/domain/slug.ts`** (B21′) — `slugify`, `RESERVED_SLUGS`, `uniqueSlug`. Tests: diacritics,
   punctuation, collapse, truncation, a reserved base, a collision chain.
3. **`core/src/domain/readiness.ts`** (B22) — `defineReadiness`, `evaluate`, `assert`. Tests: all met,
   some met, none met, and the `fieldErrors` keying that `CrudForm` depends on.
4. **`core/src/http/dto.ts`** (B24) — `project`, plus the key-equality assertion helper the projection
   tests use.
5. **`core/src/http/owned-route.ts`** (B23) — `makeOwnedResourceRoute` and `ownedAction`. Tests
   mirroring `makeCrudRoute.test.ts`'s shape: unauthenticated, wrong role, missing CSRF header, invalid
   JSON, schema failure, success, and an unsupported verb.
6. **`mentor-page` migration** + entity widening (six columns). One migration adds `slug` nullable,
   backfills it **in SQL** (no `core` import from `db`), then sets `not null`; the `stack_tags` CHECK
   carries a hand-written literal list, with the drift test from B25 living in `core`. The seeder gives
   Ada a slug and tags while keeping her headline.
7. **`services/mentors/readiness.ts`** — `mentorPagePublishable`. **`MentorProfileService`** —
   `getForOwner`, `updateForOwner`, `publish`, `getPublicBySlug`, and the three projections with their
   key-equality tests.
8. **Routes** — `GET/PUT /api/mentors/me`, `POST /api/mentors/me/publish`, public
   `GET /api/mentors/[slug]`.
9. **`ui`** — `npx shadcn@latest add checkbox badge` in `packages/ui`; `CrudForm`'s `multiselect` type;
   `useApiResource` + `ResourcePanel` (F10); migrate `/admin/users/page.tsx` onto them, preserving the
   asserted strings.
10. **Pages** — `/mentor/profile` (form, tag picker, publish action, share link with copy) and
    `/m/[slug]` (public, Tailwind, via `components/mentors/MentorPageView.tsx`).
11. **Integration** — `mentor-page.integration.test.ts`: a signed-out visitor opens the share link and
    sees the link and description; `expectAbsent` for rating/score/review/ranking (N02); the picker
    offers exactly four options. Plus `seedBookableMentor` (T1).

### Slice 3 — Slots (#17)

1. **`Slot` entity + `availability-slots` migration** with the partial unique index. The entity carries
   **no `booking` property** — E03-S03 adds the column, the foreign key and the property together, for
   the reason in the Data Model.
2. **`services/availability/occupancy.ts`** — `viableLengths`, with the full boundary matrix: exact
   touch at each end, containment, a slot with only the short length left, a slot with none left, and
   an empty occupancy set.
3. **`validators/availability/slot-create.schema.ts`** — an ISO instant, rejected in the past; the
   two-hour lead is a named constant in `core` shared with E03-S02 (R14, D22).
4. **`SlotService`** — `listForOwner`, `publish` (updates `lastPublishedAvailabilityAt` in the same
   transaction, B26), `remove` (`409` when booked, R09), `listBookableFor(mentorProfileId, now)`
   returning slots with `availableLengths`.
5. **Routes** — `/api/availability/slots` (GET, POST) and `/[id]` (DELETE) through
   `makeOwnedCollectionRoute`, whose `deleteForOwner` receives the id from `params`.
6. **`ui`** — `CrudForm`'s `datetime` field with the local→UTC conversion under test.
7. **Pages** — `/mentor/slots`; the public page renders bookable slots with their lengths.
8. **Integration** — publish a slot and see it on the share page.

### Slice 4 — Prices and bookability (#18)

1. **`core/src/money/money.ts`** (B12′) — `Cents`, `Amount`, `CurrencyCode` as the vocabulary's literal
   union, and `withinBounds(amount, bounds)`. **`splitFee` and `assertSameCurrency` are not built
   here** — E02 has no caller for either; #25 owns them.
2. **`vocabularies/{session-lengths,currencies}.ts`**; `config/env.ts` gains
   `PLATFORM_FEE_PERCENT`, `PLATFORM_CURRENCIES`, `PLATFORM_PRICE_BOUNDS`, all with defaults; §4's six
   files updated in the same PR.
3. **`PlatformSettingsService`** (B16′) — `get`, `boundsFor`, with the misconfiguration rejection.
4. **`mentor-prices` migration** + entity; `mentorPricesUpdateSchema`;
   `MentorProfileService.updatePrices` (all three fields together) and the `mentorBookable` gate.
5. **Route** `PUT /api/mentors/me/prices`; **`ui`** `CrudForm`'s `money` field; **page**
   `/mentor/prices` with the bounds as help text.
6. The public page shows both prices, or "not bookable yet" with no slot offered.
7. **Tests** — inside, outside, missing, unsupported currency, and the bookable gate's three states.

### Slice 5 — Stripe Connect onboarding (#19, 1.1)

1. **`payment-gateway.port.ts`** (B14′) — declared as `ConnectGateway`, `CheckoutGateway` and
   `PaymentGateway = ConnectGateway & CheckoutGateway`. E02's adapters implement **`ConnectGateway`
   only**, and the cradle key is typed `ConnectGateway` until #34 widens it. The full surface is
   designed here; no story writes a stub body for a method it does not implement.
2. **`adapters/stripe-payment-gateway.ts`** (Connect methods only, through E01's `fetchJson` timeout
   policy) and **`adapters/mock-payment-gateway.ts`** with `simulateAccountUpdated`.
3. **`mentor-connect` migration** + the four columns; `config/env.ts` gains `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` as `optional()` with fail-closed routes (§4 — and §4 means both schemas,
   `.env.example`, `README.md`, `ci.yml` and `tests/integration/environment.ts`).
4. **`ConnectOnboardingService`** — `start` (creates the account once, always mints a fresh link),
   `refresh`, `applyAccountUpdated` (idempotent by account id and event id). `payoutReleasable`
   readiness gate.
5. **Routes** — `GET /api/mentors/me/payouts` (read-only `makeOwnedResourceRoute`, no
   `updateForOwner`), `POST /api/payments/connect/onboard`, browser-navigated
   `GET /api/payments/connect/return`; the webhook route dispatches `account.updated`.
6. **Pages** — `/mentor/payouts` (calling `requirePageRole('mentor')` itself); a Payouts column on
   `/admin/users` behind the operator guard, which additively extends `UserDto` and `GET /api/users`
   (§1/§2).
7. **Integration** with the mock gateway — a mentor sees "payouts enabled" after the simulated event;
   a mentee cannot read the field.

## ✅ Acceptance criteria

**The per-story criteria live in the five story specs**, which own them; a copy here would be a third
transcription after the issue and the story spec, and it drifted within a day of being written. What
this document owns is the set that **no single story can assert**, because each spans slices or holds
across the whole epic:

- **A signed-in user finds no path to become a mentor.** (R07/D08, negative — the epic-wide invariant
  every slice must not break, asserted with `expectAbsent`.)
- **No mentor-facing or public screen shows a score, review, rating or ranking.** (N02/R04 and D21/R13,
  negative, asserted across every page E02 adds.)
- **Accepting an invitation leaves the mentor signed in**, holding both their previous roles and
  `mentor`. (Spans E01's session mechanism and E02-S01.)
- **A mentor who has completed every gate is bookable end to end**: page published, both prices inside
  bounds, at least one future slot offered with its available lengths, reachable by a signed-out
  visitor through the share link. (The union of Slices 2–4, and the precondition E03-S02 depends on.)
- **Nothing private crosses the public boundary**: the `/m/<slug>` payload contains no email, Stripe
  account id, payout field, invitation or publish deadline. (Slices 2 and 5 together; enforced by the
  key-equality projection tests.)
- **A price or policy change never moves an existing obligation.** (The architectural law: Slices 1 and
  4, asserted again by E03.)

## 📝 Open questions

- **Q19 — how first-iteration mentors are paid before Connect onboarding exists** (owner: founder A
  with founder B). Slices 1–4 ship in the first iteration and Slice 5 is 1.1, so a mentor can be
  booked and paid for by a mentee before any payout channel exists. **Blocking before the first payout
  falls due**, not before this spec is implemented. Carried unchanged from #19 and #25.
- **The initial price bounds** (owner: founder A). The env defaults are placeholders; the numbers are
  a product decision. Non-blocking — the mechanism does not change with the values.
- **Whether the mentor's publish-by report is needed before #30** (owner: both founders). D18's check
  is "5 of the first 20 within two weeks", and until #30 the operator counts by hand from
  `publish_due_at` (R18). Non-blocking; the column makes the query one line.
- **Three product choices this spec made because the brief is silent** (owner: founder A, all
  non-blocking, none contradicting an active record). **Currency** — the brief names none; per-profile
  currency with a single configured currency in 1.0 is the reversible reading, but "one platform
  currency, full stop" is a legitimate product answer that would simplify B12′ and B16′.
  **Invitation validity** — 14 days is a plain choice with nothing behind it. **Slug immutability** — a
  share link that survives a rename is the reason, but a mentor who dislikes their slug currently has to
  ask an operator. If founder A wants self-service renaming, it needs a redirect-alias story.
- **A pre-existing §3 violation, not introduced here.** The repository's only migration,
  `Migration20260901142829.ts`, has no `down()`. Every migration in this spec ships both directions;
  the existing one should be fixed under its own issue.

# DevMentor — Platform Primitives II (the domain floor)

Date: 2026-09-08
Status: active reference spec — moves to `implemented/` with E02 after every `SHIP` entry is verified and merged
Design authority: `.ai/specs/product-brief.md`, `.ai/specs/2026-09-01-engineering-standards.md`
Companion to: `.ai/specs/2026-09-04-platform-primitives.md` (the request floor, delivered by E01)
Contract authority: each owning story/epic named below; this catalogue is non-normative

## 📝 TLDR

Primitives I catalogued the shapes a *request* needs — a clock, a session, an error family, a
timeout, a CSRF check — and E01 delivers them. This catalogue covers the shapes a *domain* needs:
the readiness gate that says why you cannot publish yet, the route factory for "the caller's own
single record", the projection rule that keeps a private field out of a public page, the vocabulary
definition that stops the same closed set of strings being spelled four ways, and their frontend
counterparts. E02 is the first epic with production call sites for most of them; deferred entries stay
notes until their named owner has a caller.

The same YAGNI gate applies: an entry is implemented only inside the first story with a production
caller. This file indexes patterns and ownership; it does not ship as a framework, define a second
signature, or create a folder for a file that has no caller.

## 📝 Lifecycle

`SHIP` means the named owner story is expected to implement the pattern; that story is the sole
contract authority. `DEFER #n` is a non-binding note for the future owner and does not block this
document's completion. After every `SHIP` entry is verified and merged, this reference moves to
`implemented/` with the E02 epic. If it is superseded or abandoned first, it moves to `archive/` under
the repository's normal lifecycle.

**Relationship to Primitives I.** That document stays authoritative for everything it marked
`SHIP`. Where it marked an entry `DEFER` and named an E02 issue, this document is the promised
re-design and supersedes the sketch there; the entry keeps its original number with a `′` so the
two catalogues stay cross-referenceable (`B12′` here re-designs `B12` there). Primitives I is not
edited.

## 📝 Problem Statement

### The evidence: twelve feature archetypes, ten of them first used in E02

Primitives I surveyed issues #12–#34 for infrastructure shapes. Re-surveying those 23 issues for
**feature archetypes** — the recurring shape of a route and the screen in front of it — produces a
second, non-overlapping list:

| # | Archetype | Backlog issues | First consumer |
|---|---|---|---|
| A1 | Owner-scoped singleton (`/api/<concept>/me`) | #16, #18, #19, #31 | **E02-S02** |
| A2 | Owner-scoped collection | #17, #23, #26, #27, #28, #29, #32 | **E02-S03** |
| A3 | Public read model | #16, #20, #21 | **E02-S02** |
| A4 | Guarded state transition | #17, #21, #22, #24, #25, #28, #29, #30, #32 | **E02-S03** |
| A5 | Money path | #18, #21, #22, #25, #31 | **E02-S04** |
| A6 | External integration (port + adapters) | #19, #22, #33, #34 (+#12, #13) | E01; payments: **#34**, then standalone **#19** |
| A7 | Single-use token grant | #13, #15 | **E02-S01** |
| A8 | Deadline / time-bounded obligation | #15, #21, #22, #24, #30 | **E02-S01** |
| A9 | Operator action, by hand under R18 | #15, #30, #31, #32 | **E02-S01** |
| A10 | Notification fan-out | #23, #24, #27, #28, #29, #32 | E03-S04 |
| A11 | Controlled vocabulary | #16, #18, #20, #21, #28, #32 | **E02-S02** |
| A12 | Completeness / readiness gate | #16, #18, #19, #28, #29, #32 | **E02-S02** |

Ten of the twelve have their first consumer inside E02; A6's payment consumers start at #34 and then
the standalone #19 story. That is the argument for indexing them now rather than after E03: by the time E03 uses these
archetypes again, each should have one discoverable owner instead of being rediscovered.

### Three archetypes are already described in three different vocabularies

Not a hypothetical. The filed issues do this today:

- **A12** — the drift is in the *filed issues*, each quoted from its "How to implement" section:
  [#16](https://github.com/open-mercato/ai_techleaders_project/issues/16) *"`publish(session)` (throws
  `ValidationError` naming `publicWorkUrl` when it is missing, R04)"*;
  [#18](https://github.com/open-mercato/ai_techleaders_project/issues/18) *"`isBookable(profile)` =
  published and both prices set"*; [#19](https://github.com/open-mercato/ai_techleaders_project/issues/19)
  *"the mentor's page says what is missing"*. One computation, one UI, three names. The E02 story specs
  written against this catalogue already use one name — which is the point, not a counter-example.
- **A3** — [#19](https://github.com/open-mercato/ai_techleaders_project/issues/19): `payoutsEnabled`
  *"is shown to them and to no one else"*, and *"the public mentor DTO in `mentor-profile.service.ts`
  never includes it"*. This is a security rule enforced by a developer remembering it. A DTO built
  by spreading an entity satisfies today's test and leaks the next field somebody adds.
- **A11** — the same idea, four encodings: `STACK_TAGS = [...] as const` (#16),
  `z.union([z.literal(25), z.literal(50)])` (#21), a `text[]` CHECK constraint (E01 `roles`), and a
  query-param enum that must 422 on an unknown value (#20).

### Two things the current code makes impossible

Verified in the tree, not assumed:

1. **`makeCrudRoute` cannot serve archetype A1 or A2 as it stands.** `CrudService` is
   `list()/get(id)/create/update/delete` and `resolve` is `(cradle: Cradle) => CrudService`
   (`packages/core/src/http/makeCrudRoute.ts:13-34`). `list()` and `create(data)` take no id, so the
   problem is not the id — it is that **no `Session` reaches the service**, and A1 additionally has no
   `[id]` segment to key on. Both interfaces are `BACKWARD_COMPATIBILITY.md` §2 exports, so widening
   them is a breaking change, which is why Primitives I's **B4** deferred the seam to #23. This
   catalogue's B23 is the promised A1/A2 answer, reached additively instead.
2. **`CrudForm` has no field type for anything E02 collects.** `CrudFieldType` is
   `'text' | 'email' | 'number' | 'textarea' | 'checkbox' | 'select'`, and only `button` and `card`
   are installed from shadcn, so the form renders raw `<input>`/`<select>`. Stack tags need a
   multi-select, a slot needs a datetime, a price needs minor-unit money input.

## 📝 Proposed Solution

The indexed entries live in the folders the standards spec designates as growth points. Exact exports,
schemas and tests belong to the owning story. Two cross-cutting folders are proposed as siblings of
`http/` rather than concepts:

```
packages/core/src/
  domain/        + readiness.ts  vocabulary.ts  slug.ts          (new; created by E02-S02)
  money/         + money.ts                                      (new; created by E02-S04)
  http/          + owned-route.ts                                (existing folder)
  services/operator/platform-settings.service.ts                 (new concept folder, E02-S04)

packages/ui/src/backend/

  feedback/      + ReadinessChecklist.tsx                        (existing folder)
  api/           + useApiResource.ts                             (existing folder)
  panels/        + ResourcePanel.tsx                             (new)

tests/integration/
  fixtures/      + mentor.ts                                     (new)
```

`core/src/domain/` is deliberately not `core/src/lib/` or `core/src/utils/`: everything in it is a
*domain* rule expressed generically (what makes a thing ready, what a closed set of strings is, what
a public identifier is), and a folder named `utils` becomes the place things go to be forgotten.

### One architectural law, stated once

A5 and A8 are the same rule wearing different clothes, and the backlog restates it in five issues:

> **Policy is read at the transition and snapshotted; it is never re-derived at read time.**

The price on a booking (#21), the fee percentage applied (#25), and the publish-by deadline on an
accepted invitation (#15, R17) are all values captured at the moment an event happened. Changing a
price bound, the platform fee, or the two-week policy must never move an obligation that already
exists. Concretely, in E02: `Invitation.publishDueAt` is a stored `timestamptz` written at
acceptance, not `acceptedAt + INTERVAL '14 days'` computed in a query.

### Alternatives considered

- **Make this catalogue a second contract authority.** Rejected because it would duplicate the E02
  epic and drift. This document preserves the cross-backlog index and rationale; the named owner spec
  remains normative for every exact contract.
- **Amend Primitives I in place.** It is still `active`, so it is legal. Rejected: its `SHIP` set is
  E01's ship gate, and mixing E02's gate into the same document makes "what is owed by which epic"
  unreadable — which is the one thing that document does well.
- **Widen `makeCrudRoute` to carry a `Session`.** Rejected here as it was in Primitives I: it is a
  §2 breaking change to two protected interfaces, and issue #23 owns that design. B23 below reaches
  the same outcome additively, with zero blast radius, by adding a sibling factory instead.
- **Reach the session through `makeCrudRoute`'s existing `authorize(req, cradle)` hook.** E01 already
  puts a scoped `session` on the `Cradle`, so `authorize` could resolve it and `resolve(cradle)` could
  read `cradle.session` — no new factory, no §2 change. Rejected, but on the argument rather than on a
  false premise: it makes the authorization requirement invisible in the route file (`resolve:
  (c) => c.mentorProfileService` looks identical whether or not the service scopes by caller), and it
  makes "this service reads the ambient session" a property discoverable only by reading the service.
  B23 instead keeps the route guard visible while the concept service independently authorizes through
  E01's injected request-scoped `Session`. #23 may still choose the existing CRUD helper for unscoped
  lists; nothing here forecloses it.
- **A generic repository/query-builder layer.** Rejected: MikroORM's `EntityManager` already is one,
  and the standards spec's dependency rule keeps `@mikro-orm/*` inside `db`. Services take an `em`.

---

## 📝 The catalogue

`SHIP` = an E02 story has a real production call site and owns the contract linked by this entry.
`DEFER #n` = a non-binding note for the issue that first needs it. `Convention` = a rule with no code,
to which the ship gate does not apply. `′` = a re-design of the same-numbered entry in Primitives I,
which it supersedes; **B22–B27, F8–F11 and T1 are new and carry no prime** — Primitives I stops at B21
and F7. B23 is the promised re-design of that document's **B4**, and says so in its own entry.

### Backend

#### B5′ · Opaque single-use tokens — `core/src/services/auth/token.service.ts` (extended) · **SHIP**

Primitives I shipped the stateless purpose-bound pair for OAuth `state` and email verification, and
deferred the stored pair to #15. The E02 epic owns the exact token helpers and tests.

The raw token exists only inside the invitation link; the database stores the hash, unique-indexed.

**A correction to how [#15](https://github.com/open-mercato/ai_techleaders_project/issues/15) states
the lookup.** It asks for a *"constant-time hash compare"*. Looking a token up **by** its hash —
`findOne(Invitation, { tokenHash: hashToken(token) })` — has no timing oracle to defend: an attacker
cannot steer a SHA-256 digest, so the index probe leaks nothing about the 256-bit secret. A
constant-time comparison is needed only when a candidate row was loaded by some *other* key and its
stored hash is then compared, which this flow never does. Lookup-by-hash, no `timingSafeEqual`.

**The transactional single-use claim stays concept-owned.** Primitives I's B10 rule applies: a
shared helper is extracted after a *second* domain proves identical recovery semantics. E02 has
exactly one single-use claim (invitation acceptance), and E01's email verification uses the
*stateless* pair, so it is not a second consumer. `InvitationService.accept` therefore owns its own
`em.transactional` + pessimistic lock. `DEFER` the extraction to the second stored-token flow.

#### B21′ · Public slug — `core/src/domain/slug.ts` · **SHIP**

The E02 epic owns the exact slug helper, reserved values and collision behavior. The domain helper
stays pure; persistence and transaction retries remain service responsibilities.

**Two owner-spec rules are summarized here for discoverability.**

1. **A slug is generated atomically on first publication and immutable afterward.** It stays nullable
   on drafts, so invitation acceptance can keep creating empty profiles. The E02 epic owns the bounded,
   fresh-transaction collision retry and concurrent publish/unpublish behavior.
2. **A slug is not a secret.** It is enumerable by design (#20 lists them). Nothing that is not
   already public may be reachable by knowing one — which is what B24 enforces.

#### B12′ · Money — `core/src/money/money.ts` · **SHIP**

One platform currency in 1.0. The brief does not choose its value, so founder A must confirm the
proposed `USD` default before the pricing story starts. Currency is displayed and snapshotted by later
bookings but is not stored per mentor. The E02 epic owns the exact cents, bounds and parser contracts.

**Fee calculation is deferred to #25.** E02 sets prices and never divides one, so no fee helper or fee
configuration lands here. D11/R10 remains binding on the later settlement story.

The two rules Primitives I attached to this entry are unchanged and still binding: **never trust a
client amount** (#21: *"the client never supplies a price"*), and **snapshot at the transition** (#25:
`feePercentApplied`).

`parseMajorAmount` accepts a decimal string with at most two fractional digits and converts it by
string arithmetic. It rejects signs, exponent notation, grouping separators, excess precision and
values outside the safe/database integer range. Supporting a zero- or three-decimal platform currency
is a later arithmetic and migration decision, not a config flip.

#### B16′ · Platform settings with an env seed — `core/src/services/operator/platform-settings.service.ts` · **SHIP**

Backed by `config/env.ts` now; backed by a single-row table after #31 behind the same method. The
confirmed currency and the 25-/50-minute bounds are validated together. The E02 epic owns the exact
environment names, shape and service operations.

Both carry founder-approved defaults before implementation, so §4 stays satisfied. Placeholder money
policy must never become a production default. `PLATFORM_FEE_PERCENT` remains owned by #25/#31.
Configuration validation also requires integer cents, positive values and `minCents <= maxCents` for
each duration.

#### B22 · Readiness gate — `core/src/domain/readiness.ts` · **SHIP (new)**

The A12 primitive. One declarative requirement list is evaluated once and consumed twice: the service
refuses the transition and names what is missing, while the UI renders the same list as a checklist.
The E02 epic owns its exact data and error contract.

Two E02 gates, defined once each and never re-expressed:

| Gate | Requirements | Enforced by | Rendered by |
|---|---|---|---|
| `mentorPagePublishable` | public-work link, bio, ≥1 stack tag | `publish()` (#16) | profile page |
| `mentorOfferReady` | page published, 25- and 50-minute price set | public offer rendering (#18) | public page, mentor home |

Both E02 gates are declared together in `core/src/services/mentors/readiness.ts`. Connect status and
settlement readiness are owned by their 1.1 stories because provider capability and payout policy are
not the same gate.

`assert` throwing a `ValidationError` whose `fieldErrors` are keyed by requirement key is what makes
#16's acceptance criterion — *"it is not published and the missing link is named"* — fall out of the
primitive rather than be hand-written per gate: `CrudForm` already renders `fieldErrors` next to the
matching field, and the keys are chosen to match the form field names.

`evaluate` returns plain data, so it serializes into a route payload and reaches `ReadinessChecklist`
(F9) without `ui` importing `core`.

**Why not just a boolean.** `isBookable(profile)` was #18's proposal. A boolean cannot answer *why
not*, so every screen that needs the reason re-derives it — which is precisely how the same rule
came to be written three ways across #16, #18 and #19.

#### B23 · Owner-scoped route factories — `core/src/http/owned-route.ts` · **SHIP (new)**

Archetypes A1 and A2, and the compatibility-safe resolution of the seam Primitives I deferred.

The owning E02 spec defines these as **route-operation callbacks**, not another service interface.
Each callback resolves and invokes the concept service, whose E01-injected scoped session remains the
authorization authority. The factory makes the route guard visible but never accepts an owner id from
the client.

Callbacks receive the request-scoped `Cradle` and route params. `run` may return ordinary data or a
`Response`; invitation acceptance uses the latter to attach its refreshed session cookie while still
passing through `apiHandler`.

Three properties of the owner contract matter, each found in review:

- **Callbacks receive `params`.** `DELETE /api/availability/slots/[id]` and
  `POST /api/invitations/[token]/accept` are owner-scoped *and* parameterised; a factory that cannot
  read the route segment cannot serve them. It reads `ctx.params` through the same
  `ctx?.params ? await ctx.params : undefined` guard `makeCrudRoute` already needs, because a
  collection route is invoked with no params at all (`.ai/lessons.md`, 2026-09-02).
- **`role` is optional.** Invitation acceptance is performed by a signed-in **mentee** who does not yet
  hold `mentor`; a mandatory `role` would 403 the very request that grants the role.
- **`makeOwnedCollectionRoute` exists.** A2 — "X sees only their own Y", seven backlog consumers — is
  the second-largest justification in this catalogue, and without a collection factory that claim was
  unbacked. Its E02 caller is `/api/availability/slots` (#17).

Every omitted operation behaves like `makeCrudRoute`'s missing method. Both factories run inside
`withRequestScope` and call the live `requireSession` then `requireRole` for visible defence in depth.
**They never call `requireCsrfHeader`: E01's `apiHandler` is the sole central CSRF owner.** The service
uses the same scoped session from its constructor and independently enforces role and ownership.

**This is additive and breaks nothing.** `makeCrudRoute`, `CrudService` and `MakeCrudRouteOptions`
are untouched §2 exports; these are sibling callback factories. This is the
promised re-design of Primitives I's **B4**, reached without the breaking change B4 was waiting for.
#23 remains free to design its own scoped list, or to simply use `makeOwnedCollectionRoute`.

E02 call sites — `makeOwnedResourceRoute`: `GET/PUT /api/mentors/me` (#16) and
`PUT /api/mentors/me/prices` (#18).
`makeOwnedCollectionRoute`: `GET/POST /api/availability/slots`, `DELETE …/[id]` (#17).
`ownedAction`: `POST /api/mentors/me/{publish,unpublish}` (#16) and
`POST /api/invitations/[token]/accept` (#15, no `role`).

#### B24 · Audience-scoped projection — a rule plus a test helper · **SHIP (new)**

**There is deliberately no `project()` helper.** A three-line `Pick` wrapper would be a production
export whose only callers are the projections it cannot enforce anything about — the ship gate applies
to convenience functions too. What ships is the rule, the test helper that enforces it, and the
`CODE_REVIEW.md` line that requires the test. The helper sits beside Primitives I's `expectAbsent` in
the same category — shared test infrastructure, to which the production-call-site gate does not apply.

> A DTO crossing an audience boundary is built from an explicit key allowlist. A public projection is
> never produced by spreading an entity, and never by omitting fields from one.

Each concept service names its projections after the audience — `toPublicDto`, `toOwnerDto`,
`toOperatorDto` — and every public projection has a unit test calling `expectProjectionKeys`. Explicit
construction prevents entity growth from changing the DTO; key-set equality prevents a later mapper
edit from silently widening it. A subset assertion would pass on exactly the leak under test.

E02's two audiences for one entity, spelled out because this is where a leak would land:

| Projection | Includes | Never includes |
|---|---|---|
| `toPublicDto` (#16, `/m/<slug>`) | slug, displayName, avatarUrl, publicWorkUrl, bio, stackTags, prices, future slots | email, invitation, `initialPublishDueAt` |
| `toOwnerDto` (#16, #18) | public fields + drafts, prices with bounds, readiness, `initialPublishDueAt` | invitation history |

#### B25 · Vocabulary — `core/src/domain/vocabulary.ts` · **SHIP (new)**

Archetype A11: one definition feeds the Zod schema, display labels, picker options and the list a
migration's `CHECK` constraint uses. E02 owns the exact `StackTags` and `SessionLengths` definitions.

`eslint.config.mjs:44-48` forbids `packages/db/**` from importing `@devmentor/core`, so the migration
hand-writes the literal list. A migration/integration test proves the database rejects a value outside
the vocabulary; the core domain does not grow an SQL formatter or read migration source text.

**A second boundary caveat, because this is easy to get wrong.** `ui` must not import `core`
(`eslint.config.mjs`), so a picker cannot import `StackTags.options`. The options travel to the
client in the route payload or as a page prop. A client component that hard-codes the four tags to
avoid the import is a drift bug, and `CODE_REVIEW.md` should say so.

**`SessionLengths` is keyed by string** because a `Vocabulary<V extends string>` cannot key on a
number, and because `25`/`50` are also column-name suffixes (`price_25_cents`). Services convert once
at the edge with a named helper; they do not sprinkle `Number(...)`.

#### B26 · Denormalised ordering key — a maintenance rule, not a module · **Convention (no code)**

R13 orders the mentor list by *most recent published availability*, which is a fact about a mentor's
slots stored on the mentor (`MentorProfile.lastPublishedAvailabilityAt`).

> A denormalised key is written in the **same transaction** as the fact it derives from, and is
> never recomputed by a join at read time.

Two E02 owner-spec decisions are indexed here because #20 depends on both:

- **Removing a slot does not lower it.** The column records *"when this mentor last published
  availability"*, not *"whether they have any"*. Lowering it on removal would need a `MAX()`
  subquery — precisely the join the rule forbids — and would reorder the list on a delete.
- **It is not an eligibility test.** #20's list must *additionally* require an offer-ready mentor and
  at least one future, non-removed slot. Once E03 exists, that predicate also excludes slots with no
  viable length under active occupancy. Ordering key and eligibility stay separate; conflating them
  is how a mentor with no remaining availability ends up at the top of the list.

#### B14′ · Connect gateway port · **OWNED BY #19 (standalone 1.1)**

The Connect story owns a narrow `ConnectGateway`; this catalogue deliberately declares no signature.
It must include durable provisioning state, a stable mentor-scoped provider idempotency key, mentor
metadata and reconciliation after an ambiguous provider success. Checkout, refund and transfer ports
are added only by their own caller stories—there is no monolithic future-facing `PaymentGateway`.
Production account creation is blocked until the settlement topology determines the required account
configuration and capabilities.

#### B27 · Operator command harness — `core/src/operator/` · **DEFER (second R18 command)**

R18 guarantees more of these: invitations by hand until #30, price bounds until #31, payouts until
#25, disputes until #32. E02 has exactly **one** (`scripts/invite.ts`, #15), so a harness would ship
with a single caller — the artefact the ship gate exists to prevent.

Recorded so the second one does not invent a different shape: an R18 command is a `tsx` script under
`scripts/`, runs its work through `withScope`, takes arguments validated by a zod schema, prints a
single result line intended to be pasted into the shared operator note, and is listed in `README.md`
and as an npm script (§5, additive). Extract the harness when the second script exists.

### Frontend

#### F5′ · `CrudForm` field types — `ui/src/backend/forms/` · **SHIP**

E01 Slice 4 installs shadcn `input` and `label` and adds the `password` type. E02 adds the three
field types its forms actually collect, and the shadcn primitives behind them:

| Type | Renders | shadcn needed | Story |
|---|---|---|---|
| `multiselect` | a checkbox group over `options`, value `string[]` | `checkbox`, `badge` | #16 stack tags |
| `datetime` | `<input type="datetime-local">`, **value converted local → UTC ISO on change** | `input` (E01) | #17 slot start |
| `money` | major-unit decimal string with currency suffix; preserves the string for exact server parsing | `input` (E01) | #18 prices |

`multiselect` is a checkbox group rather than a combobox on purpose: there are exactly four options
(R16), and a combobox needs `command` + `popover` + `dialog`, three components installed to render
four checkboxes.

The `datetime` field is the one with a real trap. `<input type="datetime-local">` has no timezone; it
yields a wall-clock string in the viewer's zone. The field converts to a UTC ISO instant before it
reaches the schema, and the schema validates an ISO instant — so B1's UTC rule holds and the mentor
never publishes an ambiguous local time. `select` and `textarea` shadcn primitives are **not**
installed by E02; nothing in it needs them.

#### F8 · Instant rendering — `ui/src/time/` · **SHIP (new)**

The browser-side half of Primitives I's B1 timezone rule, which had no frontend counterpart. The E02
epic owns the exact `formatInstant` and `LocalTime` props.

`LocalTime` renders `<time dateTime={value}>`. **The hydration rule is the point of the component:**
the server has no viewer timezone, so formatting with the server's zone on the server and the viewer's
in the browser produces different text — a hydration mismatch on every instant on the page.

The resolution is one mechanism, not two: **the first client render is byte-identical to the server
render** — a UTC-labelled string — and the viewer-zone format is applied in a `useEffect` after mount.
There is therefore no mismatch to suppress and no `suppressHydrationWarning`. The visible cost is one
frame of UTC before the swap, which is the right trade against a wrong time rendered confidently.

It lives in `ui/src/time/`, **not** `ui/src/backend/`: `backend/` is the app-and-admin panel toolkit,
and `/m/<slug>` is a public Tailwind page that needs this component too.

E02 consumers: the publish-by date on the mentor home (#15), every slot in the mentor's table and on
the public page (#17). Backlog: #21–#29 all render instants.

#### F9 · ReadinessChecklist — `ui/src/backend/feedback/ReadinessChecklist.tsx` · **SHIP (new)**

Renders B22's `evaluate()` output as an ordered list with an accessible state per item. The UI-only
`actionsByKey` maps an unmet requirement to the screen that fixes it without putting app routes into a
core DTO. Because it takes plain data it needs nothing from `core`.

This is the component that makes the server rule and the on-screen explanation the same thing. Its
two E02 consumers are the mentor home ("publish at least one bookable session by <date>", #15) and the
profile page ("you cannot publish yet because…", #16). The standalone Connect story may reuse it for
normalized onboarding guidance. Six more screens in the backlog need it (#25, #27, #28, #29, #30,
#31), which is the widening
Primitives I's F6 predicted — F6's `EmptyState` `tone` prop covers the *one-line* case and this
covers the *itemised* case; F6 stays deferred to #25.

#### F10 · Resource fetching — `ui/src/backend/api/useApiResource.ts` + `panels/ResourcePanel.tsx` · **SHIP (new)**

The four mentor screens repeat fetch my X → loading / error / empty → render → mutate → refetch.
Without a shared pattern each would hand-wire `useEffect` + `useState` + `apiCall` and the three
feedback components. The E02 epic owns the exact hook and panel props.

`useApiResource` calls `apiCall` (never `fetch`), cancels in flight on unmount and on path change, and
exposes `reload` so a `CrudForm`'s or `WorkflowAction`'s `onSuccess` refetches without the page owning
any state. `ResourcePanel` renders the three feedback components in the right order and calls
`children` only with loaded data, so a page body never branches on `undefined`.

**The E02 owner spec assigns loading/error/empty by body shape, because two components can render
them.** `DataTable`
already takes `loading`, `error` and `emptyMessage`, and `DataTableProps` is a protected §2 export this
catalogue does not touch. The division is by **body shape**, not by preference:

- A screen whose body **is a table** uses `useApiResource` and passes `resource.loading` /
  `resource.error` straight into `DataTable`. No `ResourcePanel`.
- A screen whose body is **not** a table — a form, a status panel, the mentor home — wraps it in
  `ResourcePanel`.

Nothing renders both. This corrects a claim in the first draft: migrating `/admin/users` onto
`ResourcePanel` would have proved the opposite of what it was cited for, because that page *is* a table
and already delegates its three states to `DataTable`. E02 leaves it unchanged; a later focused
refactor may adopt `useApiResource` alone while preserving its asserted content.

Deliberately **not** a data-fetching library. No cache, no revalidation, no query keys, no
deduplication — SWR and TanStack Query are both real answers and both are a dependency plus a mental
model for four screens whose data is small, private and always refetched after a mutation. Revisit if
a screen needs cross-page cache invalidation; nothing in the backlog does.

E02 consumers — `ResourcePanel`: `/mentor` home, `/mentor/profile`, `/mentor/prices`.
`useApiResource` alone: `/mentor/slots`; `/admin/users` remains unchanged. The standalone Connect
story may reuse `ResourcePanel` for `/mentor/payouts` without making that page part of E02. The admin
users table can adopt the hook in a later refactor.

#### F11 · Copy-to-clipboard share link · **DEFER #20**

#16 needs one copy button. Placement rule 4 in `AGENTS.md` says colocate a component used by exactly
one page; promote it to `ui/src/backend/actions/` when #20's list gives each row one.

### Testing

#### T1 · Integration scenario fixtures — `tests/integration/fixtures/` · **SHIP (new)**

E02 ends with three integration scenarios, and E03–E04 open with five more that all begin
*"given a published mentor with a price and a free slot"*. Building that state by driving the browser
through invitation → profile → prices → slots takes about forty steps and reruns E02's entire UI on
every E03 test.

The owning plan stages `seedPendingInvitation`, `seedPublishedMentorProfile`, `seedMentorWithSlots`
and `seedOfferReadyMentor`; no fixture writes fields before the migration that owns them.

Implemented as a `tsx` script invoked with the harness's ephemeral `DATABASE_URL` through the same
`environment.ts` passthrough `AGENTS.md` already names as the sole exception to the config rule, so
no fixture reaches for `process.env` itself. Each fixture returns ids the test asserts against and
owns its own rows.

**The rule that keeps fixtures honest:** a scenario asserting *the behaviour under test* may seed its
prerequisites, but the story that owns a flow must still exercise that flow through the UI at least
once. E02-S01 drives invitation acceptance in the browser; E03's booking tests seed it.

---

## 📝 Data Model

This document introduces no entity. It fixes one shape E02 uses and later work inherits:

- **`MentorProfile.lastPublishedAvailabilityAt`** (`timestamptz` null) — B26's denormalised ordering
  key, added and maintained by E02-S03, read by #20.

Everything else lives in the E02 spec's data model, which owns `MentorProfile`'s widening, `Slot` and
`Invitation`.

## 📝 API Contracts

No endpoint of its own. Two contract facts later work depends on:

1. **`makeOwnedResourceRoute` / `ownedAction` join `core/src/http`'s public surface** (§2, additive).
   `makeCrudRoute`, `CrudService` and `MakeCrudRouteOptions` are unchanged.
2. **The envelope is unchanged** and still declared twice on purpose (§1). Both new factories produce
   `{ ok, data }` / `{ ok, error }` through `apiHandler`, including the `422` with `fieldErrors` that
   B22's `assert` raises.

## 📝 Edge Cases & Failure Scenarios

Only failures that are properties of a *primitive*. Product-level failure scenarios — a refused
publish, an expired invitation or an unavailable slot — are in the owning E02 story; absent Stripe
credentials belongs to the standalone Connect spec.

| Scenario | Behaviour | Primitive |
|---|---|---|
| A new private column is added to `MentorProfile` | The public projection's key-equality test fails until someone decides its audience | B24 |
| A client component hard-codes the four stack tags | Drift; caught by review, and by an integration assertion that the picker offers exactly the vocabulary's options | B25 |
| A mentor's slot renders at a different time on the server and in the browser | No hydration mismatch: UTC on the server, viewer zone after mount | F8 |
| A zero- or three-decimal platform currency is proposed | It requires an arithmetic and migration design; config alone is refused | B12′ |
| A resource fetch is in flight when the page unmounts | Aborted; no state update on an unmounted component | F10 |

## 📝 Risks & Impact Review

**Blast radius.** Most entries are new. `CrudForm` gains three field types and `token.service.ts` gains
two exports. `/admin/users/page.tsx` is unrelated to E02 and is not migrated here; if a later refactor
adopts `useApiResource`, its `DataTable` continues owning loading/error/empty states.

**The risk of this document is the same as Primitives I's, one level up.** A catalogue of seventeen
entries is an invitation to build seventeen abstractions. Two mitigations, applied above rather than
promised. First, the gate rejected six things — the transactional-claim helper (B5′), the operator
command harness (B27), the copy button (F11), `splitFee` and `assertSameCurrency` (B12′), and a
`project()` convenience wrapper (B24) — each for having one E02 caller or none. Second, every `SHIP`
entry names its E02 call site.

`viableLengths` now belongs entirely to E03, where real booking intervals exist. E02 records only the
future compatibility invariant and ships no function whose meaningful branches have no production
caller. A PR that creates `core/src/operator/` before a second R18 command exists should be sent back
on `AGENTS.md`'s YAGNI rule alone.

**The entry most likely to be wrong is F10.** A bespoke fetching hook is a well-known place to
accumulate a bad cache. It is scoped deliberately narrowly — no cache, no keys, no revalidation — and
the honest exit is that adopting TanStack Query later replaces `useApiResource`'s body while
`ResourcePanel` and every call site stay as they are.

**B24 is deliberately test-only.** Explicit DTO construction is the control; the key-equality unit
test catches later mapper widening. `CODE_REVIEW.md` requires one per public projection.

**Rollback.** Each entry is additive and independently revertable. Reverting B23 returns the affected
routes to unwritten, not to a broken state; reverting F10 returns two pages to hand-wired fetching.

**Compatibility.** No breaking change, but three §2 surfaces need an additive edit that is easy to miss
because it lives in a manifest rather than in code:

- **`packages/ui/package.json`** exposes `"./components/*": "./src/components/ui/*.tsx"`, which resolves
  only `components/ui/`. `components/mentors/MentorPageView.tsx` needs its own entry
  (`"./components/mentors/*": "./src/components/mentors/*.tsx"`), as does `ui/src/time/`.
- **`packages/core`** has no `./domain` or `./money` subpath. The new modules are re-exported from
  `core/src/index.ts` (the `.` entry) rather than gaining subpaths, so `app` can import `StackTags` and
  pass its `options` down as props.
Otherwise additive under §2 (new `core/src/http` exports, new `CrudFieldType` members, new `Cradle`
keys), §4 (every new env variable has an approved default) and §5 (the `invite` npm script).

## 📋 Phasing

This document ships no phase of its own — same rule as Primitives I. Every entry is delivered inside
an E02 slice against a real consumer:

| Delivered in | Entries |
|---|---|
| E02-S01 invitations (#15) | B5′ opaque tokens · B23 `ownedAction` role-less callback · F8 `LocalTime` · T1 `seedPendingInvitation` |
| E02-S02 mentor page (#16) | B21′ slug · B22 readiness · B23 resource/action callbacks · B24 projection rule + test helper · B25 vocabulary · F5′ `multiselect` · F9 checklist · F10 resource panel · T1 `seedPublishedMentorProfile` |
| E02-S03 slots (#17) | B23 collection callbacks · F5′ `datetime` · B26 ordering key · T1 `seedMentorWithSlots` |
| E02-S04 prices (#18) | B12′ exact money parsing/bounds · B16′ settings · F5′ `money` · T1 `seedOfferReadyMentor` |
| Standalone Connect (#19, 1.1) | B14′ ownership note only; the story owns its exact `ConnectGateway` contract |

Deferred entries are delivered by the issue named in their row: B5′'s claim helper and B27 by their
second consumer, F11 by #20, and fee calculation by #25.

## 📋 Implementation Plan

No standalone plan, by design. The steps live in the E02 spec's plan; each carries unit tests to the
repository's 100%-per-file bar with the file added to `coverage.include` in `vitest.config.mts` in
the same change.

Three documentation steps are owed by whichever PR first ships a primitive from this catalogue:

1. **`AGENTS.md` and `.ai/specs/2026-09-01-engineering-standards.md`** — that
   `core/src/domain/` and `core/src/money/` are cross-cutting siblings of
   `http/`, not concept folders; that `ui` receives vocabulary options as data and never hard-codes
   them; and that instants render through `LocalTime`.
2. **`CODE_REVIEW.md`** — one line requiring a key-equality test for every public DTO projection
   (B24), and one requiring a readiness gate rather than a bare boolean for any "you cannot do X
   until Y" rule (B22).
3. **`BACKWARD_COMPATIBILITY.md` §2** — the new `core/src/http` exports and the widened
   `CrudFieldType` union, both additive.

## 📝 Open items for a future spec

- **The `makeCrudRoute` list seam** (#23) — B23 resolves A1 and single-verb A2 operations
  additively, but a *scoped list* through `makeCrudRoute` is still #23's design. It may adopt
  the callback factory shape.
- **The transactional single-use claim** (B5′) — extract at the second stored-token flow.
- **The operator command harness** (B27) — extract at the second R18 script.
- **Slug redirect aliases** — needed the first time a mentor must be renamed without breaking a
  printed link; until then renaming is an operator action under R18.
- **Zero- and three-decimal currencies** (B12′) — an arithmetic and data-migration change, not configuration.

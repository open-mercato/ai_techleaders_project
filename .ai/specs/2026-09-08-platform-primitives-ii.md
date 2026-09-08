# DevMentor — Platform Primitives II (the domain floor)

Date: 2026-09-08
Status: active — moves to `implemented/` when its `SHIP` entries land with E02
Design authority: `.ai/specs/product-brief.md`, `.ai/specs/2026-09-01-engineering-standards.md`
Companion to: `.ai/specs/2026-09-04-platform-primitives.md` (the request floor, delivered by E01)
First consumer: `.ai/specs/2026-09-08-mentors-become-bookable.md` (issue #8)

## 📝 TLDR

Primitives I catalogued the shapes a *request* needs — a clock, a session, an error family, a
timeout, a CSRF check — and E01 delivers them. This catalogue covers the shapes a *domain* needs:
the readiness gate that says why you cannot publish yet, the route factory for "the caller's own
single record", the projection rule that keeps a private field out of a public page, the vocabulary
definition that stops the same closed set of strings being spelled four ways, and the frontend
counterparts of each. E02 is the first epic with a real production call site for all of them.

The same ship gate applies, unchanged: **an entry is `SHIP` only when an E02 story calls it from
production code.** Seventeen entries: six are promotions of deferred entries from Primitives I and
eleven are new; fifteen are `SHIP` and two are `DEFER` with the issue that will earn them. Nothing here creates a folder for a
file that has no caller.

## 📝 Lifecycle

Same as Primitives I. `SHIP` entries are owned by this document and delivered inside an E02 slice.
`DEFER #n` entries are non-binding design notes; the capability spec for issue `#n` re-designs them
against its real requirements and becomes their sole authority. This file moves to
`.ai/specs/implemented/` when E02's `SHIP` entries land, and is immutable from then on.

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
| A6 | External integration (port + adapters) | #19, #22, #33, #34 (+#12, #13) | E01, then **E02-S05** |
| A7 | Single-use token grant | #13, #15 | **E02-S01** |
| A8 | Deadline / time-bounded obligation | #15, #21, #22, #24, #30 | **E02-S01** |
| A9 | Operator action, by hand under R18 | #15, #30, #31, #32 | **E02-S01** |
| A10 | Notification fan-out | #23, #24, #27, #28, #29, #32 | E03-S04 |
| A11 | Controlled vocabulary | #16, #18, #20, #21, #28, #32 | **E02-S02** |
| A12 | Completeness / readiness gate | #16, #18, #19, #28, #29, #32 | **E02-S02** |

Ten of the twelve have their first consumer inside E02, and an eleventh (A6) gets its second instance
there. That is the whole argument for this document existing now rather than after E03: by the time
E03 uses these archetypes nine more times, the pattern is whatever E02 happened to write down.

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

Fifteen `SHIP` entries and two `DEFER`s, in the folders the standards spec already designates as
growth points. Two new cross-cutting folders, both siblings of `http/` rather than concepts:

```
packages/core/src/
  domain/        + readiness.ts  vocabulary.ts  slug.ts          (new; created by E02-S02)
  money/         + money.ts                                      (new; created by E02-S04)
  http/          + owned-route.ts  dto.ts                        (existing folder)
  services/operator/platform-settings.service.ts                 (new concept folder, E02-S04)
  services/payments/payment-gateway.port.ts + adapters/          (new concept folder, E02-S05)

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

- **Fold everything into the E02 spec.** Rejected on the same grounds Primitives I gives: a
  catalogue that is the sole authority for the domain floor is something E03–E05 can be pointed at.
  A framework buried in a feature spec is re-derived by the next feature spec.
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
  B23 puts `Session` in the service signature, where a reviewer and the type checker both see it. #23
  may still choose the ambient route for *lists*; nothing here forecloses it.
- **A generic repository/query-builder layer.** Rejected: MikroORM's `EntityManager` already is one,
  and the standards spec's dependency rule keeps `@mikro-orm/*` inside `db`. Services take an `em`.

---

## 📝 The catalogue

`SHIP` = an E02 story has a real production call site and this document owns the contract.
`DEFER #n` = a non-binding note for the issue that first needs it. `Convention` = a rule with no code,
to which the ship gate does not apply. `′` = a re-design of the same-numbered entry in Primitives I,
which it supersedes; **B22–B27, F8–F11 and T1 are new and carry no prime** — Primitives I stops at B21
and F7. B23 is the promised re-design of that document's **B4**, and says so in its own entry.

### Backend

#### B5′ · Opaque single-use tokens — `core/src/services/auth/token.service.ts` (extended) · **SHIP**

Primitives I shipped the stateless purpose-bound pair for OAuth `state` and email verification, and
deferred the stored pair to #15. #15 is now real:

```ts
mintOpaqueToken(): { token: string; tokenHash: string }  // 32 bytes from randomBytes, base64url
hashToken(token: string): string                          // sha256, lowercase hex
```

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

```ts
export const RESERVED_SLUGS: readonly string[]   // 'me','new','edit','api','admin','sign-in','mentors','m'
export function slugify(input: string): string   // NFKD → lowercase → [a-z0-9-] → collapse → trim → ≤60
export async function uniqueSlug(base: string, taken: (s: string) => Promise<boolean>): Promise<string>
```

`uniqueSlug` appends `-2`, `-3`, … and treats a reserved value as taken. Callers pass their own
existence check, so this never touches an `em` and stays a pure domain function.

**Two rules travel with it, decided here because #16 does not state them.**

1. **A slug is immutable once the page is published.** A share link is printed in a conference talk,
   a README, a tweet; a mentor-initiated rename silently 404s every one of them. Renaming is an
   operator action under R18 until a story owns redirect aliases. `slug` is `nullable` on first
   migration and becomes `not null` by expand-then-contract, exactly as #16 plans.
2. **A slug is not a secret.** It is enumerable by design (#20 lists them). Nothing that is not
   already public may be reachable by knowing one — which is what B24 enforces.

#### B12′ · Money — `core/src/money/money.ts` · **SHIP**

Per-currency, because E02-S04 stores a currency per mentor profile (resolved in the E02 spec — see
its **Resolved in this spec** section, *Currency*):

```ts
export type Cents = number;                                   // integer minor units; no other representation
export type CurrencyCode = (typeof Currencies.values)[number];  // the literal union, never `string`
export interface Amount { cents: Cents; currency: CurrencyCode }
export interface PriceBounds { min: Amount; max: Amount }       // the type B16′ returns

export function withinBounds(amount: Amount, bounds: PriceBounds): boolean;  // throws on a currency mismatch
```

`CurrencyCode` is the vocabulary's literal union rather than `string`, because `string` erases exactly
the safety the vocabulary exists to provide — every string would be assignable.

**`splitFee` and `assertSameCurrency` are deferred to #25**, and this is the ship gate biting a second
time. Neither has an E02 caller: E02 sets prices and never divides one, and `boundsFor(currency, …)`
is keyed *by* currency so its operands cannot differ. Their design is recorded in Primitives I B12 and
does not need restating; #25 owns them, including the rule that the rounding remainder goes to the
mentor so the platform absorbs it.

The two rules Primitives I attached to this entry are unchanged and still binding: **never trust a
client amount** (#21: *"the client never supplies a price"*), and **snapshot at the transition** (#25:
`feePercentApplied`).

**One constraint the per-currency decision forces, recorded so nobody discovers it in production.**
`Cents` assumes a two-decimal minor unit. That is false for JPY (0 decimals) and KWD (3). The
`CURRENCIES` vocabulary (B25) is therefore restricted in 1.0 to two-decimal currencies, and adding a
zero- or three-decimal currency is a schema-and-arithmetic change, not a config change. This is
stated here rather than discovered when a mentor prices a session at ¥5,000 and is charged ¥50.

#### B16′ · Platform settings with an env seed — `core/src/services/operator/platform-settings.service.ts` · **SHIP**

```ts
export interface PlatformSettings {
  feePercent: number;                                                  // R10, default 20
  supportedCurrencies: readonly CurrencyCode[];
  bounds: Record<CurrencyCode, { p25: PriceBounds; p50: PriceBounds }>;   // PriceBounds from B12′
}
get(): Promise<PlatformSettings>
boundsFor(currency: CurrencyCode, lengthMinutes: SessionLength): Promise<PriceBounds>  // ValidationError if unsupported
// PriceBounds is B12′'s { min: Amount; max: Amount } — one money type across both entries
```

Backed by `config/env.ts` now; backed by a single-row table after #31, *behind the same method*, so
#31 changes the storage and not one caller. Because bounds are per-currency, the seed is one
JSON variable validated by zod rather than a combinatorial explosion of
`PRICE_MIN_25_CENTS_<CCY>` names:

```
PLATFORM_FEE_PERCENT=20
PLATFORM_CURRENCIES=USD
PLATFORM_PRICE_BOUNDS={"USD":{"p25":{"min":2000,"max":25000},"p50":{"min":4000,"max":50000}}}
```

All three carry defaults, so §4 stays satisfied (a new variable without a default is a breaking
change). The zod schema rejects a bounds map that omits a supported currency, so a misconfiguration
fails at first read rather than letting a mentor price outside a bound that does not exist.

#### B22 · Readiness gate — `core/src/domain/readiness.ts` · **SHIP (new)**

The A12 primitive. One declarative requirement list, evaluated once, consumed twice — the service
refuses the transition and names what is missing, the UI renders the same list as a checklist.

```ts
export interface Requirement<T> {
  key: string;                       // also the fieldErrors key, so it matches the form field name
  label: string;                     // "A link to your public work"
  hint: string;                      // "Add a GitHub, blog or portfolio URL on the profile page."
  met: (subject: T) => boolean;
}
export interface ReadinessItem { key: string; label: string; hint: string; met: boolean }
export interface Readiness { ready: boolean; items: ReadinessItem[]; missing: ReadinessItem[] }

export function defineReadiness<T>(requirements: readonly Requirement<T>[]): {
  evaluate(subject: T): Readiness;
  assert(subject: T, message: string): void;   // throws ValidationError, fieldErrors keyed by requirement key
};
```

Three E02 gates, defined once each and never re-expressed:

| Gate | Requirements | Enforced by | Rendered by |
|---|---|---|---|
| `mentorPagePublishable` | public-work link, description, ≥1 stack tag | `publish()` (#16) | profile page |
| `mentorBookable` | page published, 25- and 50-minute price set | slot offering + `start()` (#18, #21) | public page, mentor home |
| `payoutReleasable` | Connect account exists, `payoutsEnabled` | `ConnectOnboardingService` (#19), later `payout.service` (#25) | payouts page |

All three gates are declared together in `core/src/services/mentors/readiness.ts`; the services above
consume them rather than each growing its own copy.

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

```ts
export interface OwnedResourceService<Dto, UpdateInput> {
  getForOwner(session: Session): Promise<Dto>;
  updateForOwner?(session: Session, input: UpdateInput): Promise<Dto>;  // omitted by read-only resources
}

export interface OwnedCollectionService<Dto, CreateInput> {
  listForOwner(session: Session): Promise<Dto[]>;
  createForOwner?(session: Session, input: CreateInput): Promise<Dto>;
  deleteForOwner?(session: Session, id: string): Promise<void>;
}

export function makeOwnedResourceRoute<Dto, UpdateInput>(options: {
  resolve: (cradle: Cradle) => OwnedResourceService<Dto, UpdateInput>;
  role?: Role;                                 // omitted ⇒ session only, no role requirement
  updateSchema?: z.ZodType<UpdateInput>;
}): { GET: ApiRouteHandler; PUT: ApiRouteHandler };

export function makeOwnedCollectionRoute<Dto, CreateInput>(options: {
  resolve: (cradle: Cradle) => OwnedCollectionService<Dto, CreateInput>;
  role?: Role;
  createSchema?: z.ZodType<CreateInput>;
  idParam?: string;                            // default 'id', for DELETE
}): { GET: ApiRouteHandler; POST: ApiRouteHandler; DELETE: ApiRouteHandler };

export function ownedAction<Input, Out>(options: {
  role?: Role;
  schema?: z.ZodType<Input>;
  run: (cradle: Cradle, session: Session, input: Input,
        params: Record<string, string | string[]>) => Promise<Out>;
}): ApiRouteHandler;
```

Three things this signature gets right that the first draft did not, each found in review:

- **`ownedAction` receives `params`.** `DELETE /api/availability/slots/[id]` and
  `POST /api/invitations/[token]/accept` are owner-scoped *and* parameterised; a factory that cannot
  read the route segment cannot serve them. It reads `ctx.params` through the same
  `ctx?.params ? await ctx.params : undefined` guard `makeCrudRoute` already needs, because a
  collection route is invoked with no params at all (`.ai/lessons.md`, 2026-09-02).
- **`role` is optional.** Invitation acceptance is performed by a signed-in **mentee** who does not yet
  hold `mentor`; a mandatory `role` would 403 the very request that grants the role.
- **`makeOwnedCollectionRoute` exists.** A2 — "X sees only their own Y", seven backlog consumers — is
  the second-largest justification in this catalogue, and without a collection factory that claim was
  unbacked. Its E02 caller is `/api/availability/slots` (#17).

Every optional service method behaves the way `makeCrudRoute` already behaves for a missing method:
that verb answers *"This operation is not supported"*. It is what makes
`GET /api/mentors/me/payouts` a legal read-only owned resource with no `updateForOwner`.

Both run inside `withRequestScope` and call the live `requireSession(req, cradle)` then
`requireRole(session, role)`, then `requireCsrfHeader(req)` **on state-changing verbs only** — a `GET`
is never CSRF-checked, because the header does nothing on a read and would break any browser-navigated
link. Both hand the service a `Session` — never an owner id from the body or the query. That is #23's rule
(*"never a `userId` parameter from the client"*) made structural rather than remembered.

**This is additive and breaks nothing.** `makeCrudRoute`, `CrudService` and `MakeCrudRouteOptions`
are untouched §2 exports; these are sibling factories with their own service interfaces. This is the
promised re-design of Primitives I's **B4**, reached without the breaking change B4 was waiting for.
#23 remains free to design its own scoped list, or to simply use `makeOwnedCollectionRoute`.

E02 call sites — `makeOwnedResourceRoute`: `GET/PUT /api/mentors/me` (#16),
`PUT /api/mentors/me/prices` (#18), `GET /api/mentors/me/payouts` (#19, read-only).
`makeOwnedCollectionRoute`: `GET/POST /api/availability/slots`, `DELETE …/[id]` (#17).
`ownedAction`: `POST /api/mentors/me/publish` (#16),
`POST /api/invitations/[token]/accept` (#15, no `role`),
`POST /api/payments/connect/onboard` (#19).

#### B24 · Audience-scoped projection — a rule plus a test helper · **SHIP (new)**

```ts
// packages/core/src/testing/projection-keys.ts   — test infrastructure, not production code
export function expectProjectionKeys(dto: object, allowlist: readonly string[]): void;
```

**There is deliberately no `project()` helper.** A three-line `Pick` wrapper would be a production
export whose only callers are the projections it cannot enforce anything about — the ship gate applies
to convenience functions too. What ships is the rule, the test helper that enforces it, and the
`CODE_REVIEW.md` line that requires the test. The helper sits beside Primitives I's `expectAbsent` in
the same category — shared test infrastructure, to which the production-call-site gate does not apply.

> A DTO crossing an audience boundary is built from an explicit key allowlist. A public projection is
> never produced by spreading an entity, and never by omitting fields from one.

Each concept service names its projections after the audience — `toPublicDto`, `toOwnerDto`,
`toOperatorDto` — and every public projection has a unit test calling `expectProjectionKeys`. That test
fails when someone adds a column and the projection silently grows, which is the only mechanism that
actually keeps #19's *"shown to them and to no one else"* true a year from now. **Key-set equality is
the assertion, not `toMatchObject`:** a subset check passes on exactly the leak it is meant to catch.

E02's three audiences for one entity, spelled out because this is where a leak would land:

| Projection | Includes | Never includes |
|---|---|---|
| `toPublicDto` (#16, `/m/<slug>`) | slug, displayName, avatarUrl, publicWorkUrl, description, stackTags, prices, bookable slots | email, `payoutsEnabled`, `stripeAccountId`, `payoutRequirements`, invitation, `publishDueAt` |
| `toOwnerDto` (#16, #18, #19) | everything above + prices with bounds, readiness, `payoutsEnabled`, `payoutRequirements`, `publishDueAt` | `stripeAccountId` (no purpose on a screen) |
| `toOperatorDto` (#19, admin) | owner view + `stripeAccountId`, invitation and batch | — |

#### B25 · Vocabulary — `core/src/domain/vocabulary.ts` · **SHIP (new)**

Archetype A11: one definition feeding the Zod schema, the display labels, the picker options and the
list a migration's `CHECK` constraint uses.

```ts
export interface Vocabulary<V extends string> {
  values: readonly V[];
  schema: z.ZodType<V>;                              // z.enum(values)
  is(value: unknown): value is V;
  label(value: V): string;
  options: readonly { value: V; label: string }[];   // plain data — safe to serialize to the client
  sqlValueList(): string;                            // "'typescript','react',…" — see the boundary note
}
export function defineVocabulary<V extends string>(entries: Record<V, string>): Vocabulary<V>;
```

E02 defines three:

```ts
// core/src/domain/vocabularies/stack-tags.ts   (D21, R16 — the four beachhead stacks, D24)
export const StackTags = defineVocabulary({
  typescript: 'TypeScript', react: 'React', python: 'Python', 'ai-agents': 'AI agents',
});
// core/src/domain/vocabularies/session-lengths.ts   (R01, D01)
export const SessionLengths = defineVocabulary({ '25': '25 minutes', '50': '50 minutes' });
// core/src/domain/vocabularies/currencies.ts     (two-decimal currencies only — see B12′)
export const Currencies = defineVocabulary({ USD: 'US dollar' });
```

**`sqlValueList()` cannot be called by a migration, and that is not the migration's fault.**
`eslint.config.mjs:44-48` forbids `packages/db/**` from importing `@devmentor/core`, so the migration
hand-writes the literal list. The drift control is a **`core`-side unit test** that reads the migration
file from disk — an `fs` read, not an import, so no boundary is crossed — and asserts the literal it
contains equals `StackTags.sqlValueList()`. That test is the member's only caller; if a reviewer finds
that too thin, drop `sqlValueList` and have the test compare against `StackTags.values` directly.

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

Two decisions #17 leaves open, settled here because #20 depends on both:

- **Removing a slot does not lower it.** The column records *"when this mentor last published
  availability"*, not *"whether they have any"*. Lowering it on removal would need a `MAX()`
  subquery — precisely the join the rule forbids — and would reorder the list on a delete.
- **It is not a bookability test.** #20's list must *additionally* filter to mentors who are bookable
  and have at least one future, unbooked, non-removed slot. Ordering key and eligibility predicate
  are separate; conflating them is how a mentor with no remaining slots ends up at the top of the
  list.

#### B14′ · Payment gateway port — `core/src/services/payments/payment-gateway.port.ts` · **SHIP (Connect operations only)**

Primitives I recorded this port's full surface and deferred all of it to #22. E02-S05 needs three of
its seven operations. The **whole interface is declared here** so it is designed once, and each
method is implemented by the story that owns it:

```ts
export interface PaymentGateway {
  // E02-S05 / #33 — Connect onboarding
  createConnectAccount(input: { mentorProfileId: string; email: string; country?: string }): Promise<{ accountId: string }>;
  createAccountLink(input: { accountId: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string; expiresAt: Date }>;
  getAccountStatus(accountId: string): Promise<{ payoutsEnabled: boolean; requirements: readonly string[] }>;
  // E03-S03 (#22), task T01 (#34) — Checkout    (declared, not implemented by E02)
  createCheckoutSession(input: CheckoutInput): Promise<{ id: string; url: string }>;
  parseWebhookEvent(rawBody: string, signature: string): Promise<GatewayEvent>;
  // E03-S05 (#24), E03-S06 (#25)               (declared, not implemented by E02)
  refund(input: RefundInput): Promise<RefundResult>;
  transfer(input: TransferInput): Promise<TransferResult>;
}
```

**This deliberately pre-empts part of #34's design, and the boundary is explicit.** E02-S05 owns the
three Connect method signatures and both adapters' implementations of them. #34 owns
`CheckoutInput`, `GatewayEvent`, and the Checkout implementations; it may refine those four
signatures without this document's permission, because no E02 code calls them. What #34 may **not**
do is redeclare a second payment port. Whichever story ships first creates the file; the other adds
methods additively, which §2 permits.

Both adapters are first-class deliverables: `adapters/stripe-payment-gateway.ts` and
`adapters/mock-payment-gateway.ts`. The mock exposes `simulateAccountUpdated(accountId, status)` for
E02-S05's integration scenario, mirroring the `simulateCheckoutCompleted(...)` #34 requires. Adapter
selection follows E01's rule exactly: the normal container registers only the real adapter, missing
credentials make the route fail closed with `ServiceUnavailableError`, and the integration harness
selects the mock through an explicit composition decision — never as a fallback from absent config.

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
| `money` | minor-unit integer entry with a currency suffix and the bound shown as help text | `input` (E01) | #18 prices |

`multiselect` is a checkbox group rather than a combobox on purpose: there are exactly four options
(R16), and a combobox needs `command` + `popover` + `dialog`, three components installed to render
four checkboxes.

The `datetime` field is the one with a real trap. `<input type="datetime-local">` has no timezone; it
yields a wall-clock string in the viewer's zone. The field converts to a UTC ISO instant before it
reaches the schema, and the schema validates an ISO instant — so B1's UTC rule holds and the mentor
never publishes an ambiguous local time. `select` and `textarea` shadcn primitives are **not**
installed by E02; nothing in it needs them.

#### F8 · Instant rendering — `ui/src/time/` · **SHIP (new)**

The browser-side half of Primitives I's B1 timezone rule, which had no frontend counterpart.

```tsx
export function formatInstant(iso: string, opts?: { style?: 'datetime' | 'date' | 'time' }): string;
export function LocalTime({ value, style }: { value: string; style?: 'datetime' | 'date' | 'time' }): JSX.Element;
```

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

```tsx
export function ReadinessChecklist(props: {
  title: string;
  items: readonly { key: string; label: string; hint: string; met: boolean }[];
  action?: ReactNode;
}): JSX.Element;
```

Renders B22's `evaluate()` output — a list of met/unmet requirements with the hint under each unmet
one — as an ordered list with an accessible state per item (not colour alone). Because it takes plain
data it needs nothing from `core`.

This is the component that makes the server rule and the on-screen explanation the same thing. Its
three E02 consumers are the mentor home ("publish at least one bookable session by <date>", #15), the
profile page ("you cannot publish yet because…", #16) and the payouts page ("Stripe still needs…",
#19). Six more screens in the backlog need it (#25, #27, #28, #29, #30, #31), which is the widening
Primitives I's F6 predicted — F6's `EmptyState` `tone` prop covers the *one-line* case and this
covers the *itemised* case; F6 stays deferred to #25.

#### F10 · Resource fetching — `ui/src/backend/api/useApiResource.ts` + `panels/ResourcePanel.tsx` · **SHIP (new)**

The four mentor screens are the same screen four times: fetch my X → loading / error / empty → render
→ mutate → refetch. Today each one would hand-wire `useEffect` + `useState` + `apiCall` +
`LoadingMessage` / `ErrorMessage` / `EmptyState`, which is exactly what `/admin/users/page.tsx` does
today in 20 lines that every new page would copy.

```tsx
export function useApiResource<T>(path: string | null, opts?: { skip?: boolean }): {
  data: T | undefined; error: string | null; loading: boolean; reload: () => void;
};

export function ResourcePanel<T>(props: {
  resource: ReturnType<typeof useApiResource<T>>;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}): JSX.Element;
```

`useApiResource` calls `apiCall` (never `fetch`), cancels in flight on unmount and on path change, and
exposes `reload` so a `CrudForm`'s or `WorkflowAction`'s `onSuccess` refetches without the page owning
any state. `ResourcePanel` renders the three feedback components in the right order and calls
`children` only with loaded data, so a page body never branches on `undefined`.

**Who owns loading/error/empty, decided here, because two components can render them.** `DataTable`
already takes `loading`, `error` and `emptyMessage`, and `DataTableProps` is a protected §2 export this
catalogue does not touch. The division is by **body shape**, not by preference:

- A screen whose body **is a table** uses `useApiResource` and passes `resource.loading` /
  `resource.error` straight into `DataTable`. No `ResourcePanel`.
- A screen whose body is **not** a table — a form, a status panel, the mentor home — wraps it in
  `ResourcePanel`.

Nothing renders both. This corrects a claim in the first draft: migrating `/admin/users` onto
`ResourcePanel` would have proved the opposite of what it was cited for, because that page *is* a table
and already delegates its three states to `DataTable`. It adopts `useApiResource` only — the honest and
much smaller migration — leaving `heading "Users"`, the three asserted `cell` values and
`link "Users"` (`admin.integration.test.ts:22`) untouched.

Deliberately **not** a data-fetching library. No cache, no revalidation, no query keys, no
deduplication — SWR and TanStack Query are both real answers and both are a dependency plus a mental
model for four screens whose data is small, private and always refetched after a mutation. Revisit if
a screen needs cross-page cache invalidation; nothing in the backlog does.

E02 consumers — `ResourcePanel`: `/mentor` home, `/mentor/profile`, `/mentor/prices`,
`/mentor/payouts`. `useApiResource` alone: `/mentor/slots` and `/admin/users`, both tables — and
`/admin/users` was written before the hook existed, which is the useful test of its shape.

#### F11 · Copy-to-clipboard share link · **DEFER #20**

#16 needs one copy button. Placement rule 4 in `AGENTS.md` says colocate a component used by exactly
one page; promote it to `ui/src/backend/actions/` when #20's list gives each row one.

### Testing

#### T1 · Integration scenario fixtures — `tests/integration/fixtures/` · **SHIP (new)**

E02 ends with three integration scenarios, and E03–E04 open with five more that all begin
*"given a published mentor with a price and a free slot"*. Building that state by driving the browser
through invitation → profile → prices → slots takes about forty steps and reruns E02's entire UI on
every E03 test.

```ts
export async function seedBookableMentor(opts?: {
  slug?: string; stackTags?: string[]; price25Cents?: number; price50Cents?: number;
  currency?: string; slotsAt?: Date[];
}): Promise<{ userId: string; mentorProfileId: string; slug: string; slotIds: string[] }>;
export async function seedPendingInvitation(opts?: { email?: string; stackTags?: string[] }):
  Promise<{ token: string; invitationId: string }>;
```

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
  key, added by E02-S02, maintained by E02-S03, read by #20.

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
publish, an expired invitation, an unbookable slot, absent Stripe credentials — are in the E02 spec's
Edge Cases table.

| Scenario | Behaviour | Primitive |
|---|---|---|
| A new private column is added to `MentorProfile` | The public projection's key-equality test fails until someone decides its audience | B24 |
| A client component hard-codes the four stack tags | Drift; caught by review, and by an integration assertion that the picker offers exactly the vocabulary's options | B25 |
| A mentor's slot renders at a different time on the server and in the browser | No hydration mismatch: UTC on the server, viewer zone after mount | F8 |
| A zero-decimal currency is added to `PLATFORM_CURRENCIES` | Config is rejected by the vocabulary; adding one is a code change | B12′, B25 |
| A resource fetch is in flight when the page unmounts | Aborted; no state update on an unmounted component | F10 |

## 📝 Risks & Impact Review

**Blast radius.** Every `SHIP` entry is new code in a new file except three: `CrudForm` gains three
field types (additive to `CrudFieldType`, a §2 union — additive is free), `/admin/users/page.tsx` is
migrated onto `ResourcePanel` (page markup is explicitly *not protected*, but
`admin.integration.test.ts` asserts `heading "Users"` and three `cell` strings, which the migration
must preserve), and `token.service.ts` gains two exports.

**The risk of this document is the same as Primitives I's, one level up.** A catalogue of seventeen
entries is an invitation to build seventeen abstractions. Two mitigations, applied above rather than
promised. First, the gate rejected six things — the transactional-claim helper (B5′), the operator
command harness (B27), the copy button (F11), `splitFee` and `assertSameCurrency` (B12′), and a
`project()` convenience wrapper (B24) — each for having one E02 caller or none. Second, every `SHIP`
entry names its E02 call site.

**One entry survives on a technicality and should be read that way.** `viableLengths` (owned by the
E02 spec, not this catalogue) *is* called from production code in Slice 3, but with an empty occupancy
set until E03 creates a `Booking`, so no interesting branch of it runs in E02. It is kept regardless,
because the alternative is #17 shipping a slot model #21 must immediately change — but its branch
coverage comes from unit tests, not from anything E02 does at runtime. A PR that creates `core/src/operator/` before a second R18 command exists should be sent back
on `AGENTS.md`'s YAGNI rule alone.

**The entry most likely to be wrong is F10.** A bespoke fetching hook is a well-known place to
accumulate a bad cache. It is scoped deliberately narrowly — no cache, no keys, no revalidation — and
the honest exit is that adopting TanStack Query later replaces `useApiResource`'s body while
`ResourcePanel` and every call site stay as they are.

**The entry most likely to be under-built is B24.** A three-line `project` plus a convention is not
enforcement; a determined mistake still ships a leak. The key-equality unit test is the real control,
and it only works if the review checklist requires one per public projection. That line belongs in
`CODE_REVIEW.md` in the same PR.

**Rollback.** Each entry is additive and independently revertable. Reverting B23 returns the affected
routes to unwritten, not to a broken state; reverting F10 returns two pages to hand-wired fetching.
B14′ is the exception: it must land with E02-S05's routes, or the port has no implementation.

**Compatibility.** No breaking change, but three §2 surfaces need an additive edit that is easy to miss
because it lives in a manifest rather than in code:

- **`packages/ui/package.json`** exposes `"./components/*": "./src/components/ui/*.tsx"`, which resolves
  only `components/ui/`. `components/mentors/MentorPageView.tsx` needs its own entry
  (`"./components/mentors/*": "./src/components/mentors/*.tsx"`), as does `ui/src/time/`.
- **`packages/core`** has no `./domain` or `./money` subpath. The new modules are re-exported from
  `core/src/index.ts` (the `.` entry) rather than gaining subpaths, so `app` can import `StackTags` and
  pass its `options` down as props.
- **`UserDto` and `GET /api/users`** gain a payouts field for the operator's column — both are §1/§2
  protected surfaces. Additive, and it lands with E02-S05.

Otherwise additive under §2 (new `core/src/http` exports, new `CrudFieldType` members, new `Cradle`
keys), §4 (the E02 spec's seven new env vars, every one defaulted) and §5 (the `invite` npm script).
The `CODE_REVIEW.md` additions and the `AGENTS.md` amendment below are documentation.

## 📋 Phasing

This document ships no phase of its own — same rule as Primitives I. Every entry is delivered inside
an E02 slice against a real consumer:

| Delivered in | Entries |
|---|---|
| E02-S01 invitations (#15) | B5′ opaque tokens · B23 `ownedAction` (role-less variant) · F8 `LocalTime` · F9 `ReadinessChecklist` · T1 `seedPendingInvitation` |
| E02-S02 mentor page (#16) | B21′ slug · B22 readiness · B23 `makeOwnedResourceRoute` · B24 projection rule + test helper · B25 vocabulary · B26 ordering key · F5′ `multiselect` · F10 resource panel · T1 `seedBookableMentor` |
| E02-S03 slots (#17) | B23 `makeOwnedCollectionRoute` · F5′ `datetime` · B26 maintenance |
| E02-S04 prices (#18) | B12′ money (`Amount`, `withinBounds`) · B16′ settings · F5′ `money` field |
| E02-S05 Connect (#19, 1.1) | B14′ payment port + both adapters |

Deferred entries are delivered by the issue named in their row: B5′'s claim helper and B27 by their
second consumer, F11 by #20, and B12′'s `splitFee` / `assertSameCurrency` by #25.

## 📋 Implementation Plan

No standalone plan, by design. The steps live in the E02 spec's plan; each carries unit tests to the
repository's 100%-per-file bar with the file added to `coverage.include` in `vitest.config.mts` in
the same change.

Three documentation steps are owed by whichever PR first ships a primitive from this catalogue:

1. **`AGENTS.md`** — that `core/src/domain/` and `core/src/money/` are cross-cutting siblings of
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
  `OwnedResourceService`'s shape.
- **The transactional single-use claim** (B5′) — extract at the second stored-token flow.
- **The operator command harness** (B27) — extract at the second R18 script.
- **Slug redirect aliases** — needed the first time a mentor must be renamed without breaking a
  printed link; until then renaming is an operator action under R18.
- **Zero- and three-decimal currencies** (B12′) — a schema and arithmetic change, not configuration.

# Epic E02 Slice 4 — Mentor prices and offer readiness

Date: 2026-09-10
Status: in-progress
Issue: #18
Epic: #8
Source spec: .ai/specs/2026-09-08-mentor-prices.md
Architecture authority: .ai/specs/2026-09-08-mentors-become-bookable.md

## Tasks

> Authoritative status table. `Status` is `todo` or `done`. Each Step is exactly one commit.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 0 | 0.1 | Resolve the approved pricing policy in the active specification | inline | done | 55e708b |
| 1 | 1.1 | Add exact money primitives and session-length vocabulary | dispatch:standard | done | bf1691f |
| 1 | 1.2 | Add approved platform price configuration and settings service | dispatch:capable | done | 571e9c2 |
| 1 | 1.3 | Add price persistence, atomic service updates and offer readiness | dispatch:capable | todo | — |
| 1 | 1.4 | Add the owner-scoped mentor-prices route | dispatch:standard | todo | — |
| 2 | 2.1 | Add the CrudForm money field | dispatch:standard | todo | — |
| 2 | 2.2 | Add mentor price management and public price presentation | dispatch:capable | todo | — |
| 3 | 3.1 | Add offer-ready fixtures, integration coverage and browser proof | dispatch:capable | todo | — |

## Goal

Let mentors save both session prices in the approved platform currency, enforce operator bounds
authoritatively, and expose one offer-readiness contract to the mentor and public experiences.

## Scope

- Add exact major-decimal-to-minor-unit parsing and typed price-bound helpers.
- Configure PLN with approved 25-minute PLN 90–600 and 50-minute PLN 180–1,200 bounds through one service.
- Persist both integer-cent prices atomically and compute offer readiness from publication and both prices.
- Add the owner price API and mentor price screen using the shared route, form and feedback layers.
- Show public prices only when both exist; otherwise show “Not bookable yet” while retaining future availability.
- Prove validation, ownership, atomicity, projections, migration reversibility and the complete offer-ready journey.

## Non-goals

- No currency picker, per-mentor currency, platform fee, checkout, payment collection or payout behavior.
- No booking price snapshot; E03 owns the booking record and immutable price snapshot.
- No operator settings screen; E05-S02 will replace hand-configured bounds behind the same service.
- No Stripe Connect work; issue #19 is separate iteration 1.1 work and not an Epic02 slice.

## Risks

- Money parsing must use string arithmetic, reject excess fractional precision and guard PostgreSQL integer range.
- Both prices must change in one transaction or neither may change.
- Missing or invalid production policy must fail closed on writes without breaking database-free builds.
- Public DTOs must expose only integer cents and currency; operator bounds remain owner-only.
- This risk-high PR is intentionally stacked on Slice 3 PR #46 and requires a separate reviewer and manual QA.

## External References

- None.

## Implementation Plan

### Phase 1: Domain, configuration and API contracts

0.1 Update the active story specification from blocked to ready, record PLN and both founder-approved
bounds, resolve its open questions, distinguish the parser-only `20.00` example from valid persistence,
and pin the serialized bounds contract. Record this reviewed execution plan and run handoff in the same
initial commit.

1.1 Add `Cents`, exact decimal parsing and inclusive bound checks under `core/src/money`, plus the
25/50-minute vocabulary. Cover canonical inputs, leading/trailing rules, excess precision, maximum
integer overflow and both inclusive boundaries; export only the intended public API.

1.2 Add approved `PLATFORM_CURRENCY=PLN` and `PLATFORM_PRICE_BOUNDS` as JSON no longer than 256
characters with exact shape `{"25":{"minCents":9000,"maxCents":60000},"50":{"minCents":18000,"maxCents":120000}}`.
Reject unknown keys, invalid JSON, non-positive/non-integer/PostgreSQL-overflow values, `min > max` and
currencies other than PLN. Parse to `{ p25: PriceBounds, p50: PriceBounds }`. Move all six compatibility surfaces together: both zod env schemas,
`.env.example`, README, CI and integration environment. Add `PlatformSettingsService.get/boundsFor`,
fail closed for incomplete, malformed, unsupported or internally inconsistent resolved policy, register
it in the cradle, and document the protected additive AppEnv/DbEnv/Cradle/core-export contracts in
`BACKWARD_COMPATIBILITY.md`.

1.3 Add nullable positive `price_25_cents` and `price_50_cents` columns through a reversible migration
and tracked snapshot. Add the exact-decimal request schema, extend owner/public projections compatibly,
and implement `MentorProfileService.updatePrices` so both values parse, validate and flush together.
Add the pure `mentorOfferReady` gate for page published plus both stored prices; future-slot readiness
remains a separate mentor-home item. Extend DTOs source-compatibly: public `prices?: { price25Cents,
price50Cents, currency } | null`, owner the same plus optional `priceBounds`; defaults preserve existing
mapper/direct-constructor consumers. Add key-equality tests proving bounds and private fields never cross
the public projection, and record all protected DTO/service/entity changes in `BACKWARD_COMPATIBILITY.md`.

1.4 Build `PUT /api/mentors/me/prices` with `makeOwnedResourceRoute`, `role: 'mentor'`,
`updateSchema: mentorPricesUpdateSchema` and the independently owner-checking
`MentorProfileService.updatePrices`; export only the destructured `PUT`. Keep central CSRF and the
standard API envelope; test exact module exports/helper configuration, authorization, shape validation,
service policy errors, successful projection and unexpected error handling.

### Phase 2: Shared form and screens

2.1 Extend `CrudForm` with a source-compatible money field that keeps decimal input as a string, renders fixed currency,
connects bounds help and server field errors, and preserves entered values on failure. It must not parse
or round with JavaScript numbers. Cover empty, valid, invalid, pending, error and successful submissions,
and record the protected `CrudFieldType`/field-prop additions in `BACKWARD_COMPATIBILITY.md`.

2.2 Add `/mentor/prices`, its authorized navigation entry and readiness link inside the existing AppShell
layout, using `CrudForm` and neutral fact chips for both approved ranges. Extend `MentorOnboardingStatus`
and its backing reads so one `ReadinessChecklist` combines page, price and separate future-slot items,
with actions to `/mentor/profile`, `/mentor/prices` and `/mentor/slots`; cover complete and incomplete states.
Extend the public mentor view to show both server-owned
prices, or a `Not bookable yet` state with no booking action while future availability remains visible.
Keep public-page styling, allowlist projection and page-level role guards intact.

### Phase 3: Cross-boundary proof

3.1 Add `seedOfferReadyMentor` by composing the existing published-profile and slot fixtures. Exercise
exact storage of valid `90.00`/`180.00`, lower and upper refusal for each field with bound-bearing errors,
atomic mixed-validity refusal, owner/public projection,
unpriced public state and the complete signed-out offer-ready share page in integration tests. Run desktop,
320px, light/dark and keyboard/accessibility browser checks for price management and public presentation,
then publish redacted screenshots and final-gate evidence. Use `expectAbsent` to prove the new mentor/public
screens contain no score, rating, review or ranking; prove the public payload/page excludes email,
invitation/publish deadline and price bounds; and prove an unpriced profile keeps future slots while exposing
no booking or checkout action.

## Decisions

- Founder approval supplied in this run: platform currency PLN; 25-minute bounds PLN 90–600; 50-minute
  bounds PLN 180–1,200. Storage uses integer minor units (9,000–60,000 and 18,000–120,000 cents).
- Bounds are configuration-backed in 1.0 and consumed only through `PlatformSettingsService`, preserving
  the planned operator-settings replacement.
- Stripe Connect remains separate issue #19 / iteration 1.1 and does not block completing Epic02's four slices.

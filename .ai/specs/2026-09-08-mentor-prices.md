# DevMentor — E02-S04: Prices within the operator's bounds

Date: 2026-09-08
Status: active
Issue: [#18](https://github.com/open-mercato/ai_techleaders_project/issues/18) (epic #8)
Depends on: E02-S01 (#15), E02-S02 (#16); E01 Slices 1, 2 and 4
Design authority for architecture, data model and money rules:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 4) and
`.ai/specs/2026-09-08-platform-primitives-ii.md` (B12′, B16′, F5′)

A **thin story spec** — behaviour, screens and acceptance criteria only.

## 📝 TLDR

A mentor sets a 25-minute and a 50-minute price in their currency, refused outside the operator's
bounds. Both appear on the mentor page, and a mentor without both is not bookable. A booking made at an
old price keeps it.

## 📝 Problem Statement

D09/R08 give each mentor control over price within operator-set bounds. The repository has no price
field and no notion of bounds, so nothing can be booked at a known amount. E05-S02 (#31) gives the
operator a screen for the bounds; until then the founders set them by hand (R18) — which is why every
consumer reads them through one service now, so #31 changes the storage and not one caller.

## 📝 Scope

**In:** the two prices and the currency; per-currency operator bounds and the platform fee behind one
settings service; the refusal that names the breached bound; the `mentorBookable` gate the public page
and E03-S02 both read.

**Out:** the operator settings screen (#31); the fee split and payouts (#25); the booking's own price
snapshot (#21, #22 — this story only guarantees that changing a price never touches one).

## 📝 UI/UX

**`/mentor/prices`** — app surface. Two `money` fields with the applicable bound printed under each as
help text, plus the currency. **All three save together**: currency is never updated alone, because a
currency change with stale prices would silently reprice a mentor by an order of magnitude.

An out-of-bounds save is refused with the bound in the message, keyed to the field.

**`/m/[slug]`** shows both prices. A mentor who is published but not priced shows "not bookable yet"
and no bookable slot, rather than a slot that fails at checkout.

## ✅ Acceptance criteria

- Given operator bounds set by hand under R18, When a mentor sets a 25-minute and a 50-minute price
  inside them, Then the mentor page shows both. (R08, R01)
- Given a price outside the bounds, When the mentor saves, Then the save is refused and the bound is
  shown. (R08, negative)
- Given a mentor with no prices set, When a visitor opens the page, Then no slot can be booked and the
  page says the mentor is not bookable yet. (negative)
- Given a mentor changing a price, When a session was already booked at the old price, Then that
  booking keeps its price. (money, negative — asserted by E03)
- Given a currency with no configured bounds, When a mentor tries to use it, Then the save is refused
  rather than silently accepted. (misconfiguration)
- Given a mentor changing currency, When they save, Then both prices are revalidated against the new
  currency's bounds in the same operation.

## 📝 Risks

`risk-high` (money), `needs-qa`, second reviewer. Compatibility: additive columns (§3); three new env
variables, all with defaults (§4, additive), listed in `.env.example` and `README.md`.

**The per-currency decision has a stated cost.** Prices in minor units assume a two-decimal currency,
which is false for JPY and KWD. The `Currencies` vocabulary is restricted to two-decimal currencies in
1.0, so adding a zero-decimal one is a code change and not a config change — see the epic spec's Risks
and B12′.

## 📝 Decisions in play

D09/R08, R01/D01, D11/R10, D19/R18.

## 📝 Open questions

- **The initial bound values** (owner: founder A). The env defaults are placeholders; the numbers are a
  product decision and the mechanism does not change with them. Non-blocking.
- **Currency** — resolved in the epic spec: per mentor profile, with per-currency bounds and a
  two-decimal restriction. `PLATFORM_CURRENCIES=USD` in 1.0 makes the runtime behaviour identical to a
  single-currency design.

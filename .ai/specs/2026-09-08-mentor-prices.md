# DevMentor — E02-S04: Prices within the operator's bounds

Date: 2026-09-08
Status: ready — platform currency and initial bounds approved on 2026-09-10
Issue: [#18](https://github.com/open-mercato/ai_techleaders_project/issues/18) (epic #8)
Depends on: E02-S01 (#15), E02-S02 (#16), E02-S03 (#17); E01 Slices 1, 2 and 4
Design authority for architecture, data model and money rules:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 4). The primitive catalogue in
`.ai/specs/2026-09-08-platform-primitives-ii.md` (B12′, B16′, F5′) is an index, not a second authority.

A **thin story spec** — behaviour, screens and acceptance criteria only.

## 📝 TLDR

A mentor sets a 25-minute and a 50-minute price in PLN, refused outside the operator's approved
bounds. Both appear on the mentor page, and a mentor without both is not ready to offer a bookable
session. The approved initial bounds are PLN 90–600 for 25 minutes and PLN 180–1,200 for 50 minutes.

## 📝 Problem Statement

D09/R08 give each mentor control over price within operator-set bounds. The repository has no price
field and no notion of bounds, so nothing can be booked at a known amount. E05-S02 (#31) gives the
operator a screen for the bounds; until then the founders set them by hand (R18) — which is why every
consumer reads them through one service now, so #31 changes the storage and not one caller.

## 📝 Scope

**In:** two integer-cent prices in one platform currency; one bounds object behind the settings
service; exact decimal-to-cents parsing; the refusal that names the breached bound; the
`mentorOfferReady` gate the public page and E03-S02 both read.

**Out:** the operator settings screen (#31); the platform fee, fee split and payouts (#25); the
booking's own price snapshot (#21, #22); currencies other than PLN.

## 📝 UI/UX

**`/mentor/prices`** — app surface. Two decimal money fields with the applicable bound and fixed
platform currency printed as help text. There is no mentor-selectable currency. Both prices save
together. The server parses their decimal strings exactly (the money primitive maps `20.00` to `2000`
cents) and rejects excess fractional precision instead of rounding through binary floating point. A
price save must still satisfy the approved bounds, so `20.00` is a parser example rather than a valid
mentor price.

An out-of-bounds save is refused with the bound in the message, keyed to the field.

**`/m/[slug]`** shows both prices. A mentor who is published but not priced shows "not bookable yet"
and no booking action. Future availability may remain visible; it must not lead to a checkout that
cannot succeed.

## ✅ Acceptance criteria

- Given operator bounds set by hand under R18, When a mentor sets a 25-minute and a 50-minute price
  inside them, Then the mentor page shows both. (R08, R01)
- Given a price outside the bounds, When the mentor saves, Then the save is refused and the bound is
  shown. (R08, negative)
- Given a mentor with no prices set, When a visitor opens the page, Then no booking action is offered
  and the page says the mentor is not bookable yet. (negative)
- Given `20.00`, When the exact money primitive parses the amount, Then it returns exactly `2000`
  cents; given more fractional digits than PLN supports, Then parsing is refused rather than rounded.
  Price persistence separately enforces the approved bounds. (money)
- Given one valid price and one invalid price, When the mentor saves, Then neither price changes.
- Given the platform currency or bounds are missing, When a mentor tries to save, Then the route fails
  closed rather than silently inventing values. (misconfiguration)
- Given either owner or public price data is read, Then prices are integer cents plus the platform
  currency; only the owner DTO includes operator bounds.

E03 must snapshot the selected duration, platform currency and price on `Booking`; changing a mentor's
current prices must never rewrite an existing booking. That behavior is an E03 acceptance criterion,
not a partially implemented behavior in this slice.

## 📝 Risks

`risk-high` (money), `needs-qa`, second reviewer. Compatibility: additive columns (§3); approved
`PLATFORM_CURRENCY` and `PLATFORM_PRICE_BOUNDS` configuration (§4, additive), listed in `.env.example`
and `README.md`. The approved defaults are production policy, not placeholders. A malformed,
unsupported or incomplete resolved policy fails closed.

`PLATFORM_CURRENCY` is the literal `PLN`. `PLATFORM_PRICE_BOUNDS` is a JSON object no longer than 256
characters with exactly this shape (whitespace is allowed):

```json
{"25":{"minCents":9000,"maxCents":60000},"50":{"minCents":18000,"maxCents":120000}}
```

Each value is a positive integer no larger than PostgreSQL's integer maximum, and each minimum is no
greater than its maximum. The parsed service shape is
`{ p25: { minCents, maxCents }, p50: { minCents, maxCents } }`. Unknown keys, unsupported currency,
invalid JSON and inconsistent ranges are configuration errors, never silently repaired.

The first release supports the single approved platform currency only. Supporting currencies with
different minor-unit rules is a later product and schema change, not an environment-only expansion.

## 📝 Decisions in play

D09/R08, R01/D01, D11/R10, D19/R18.

## 📝 Resolved decisions

- **Platform currency** (founders, approved 2026-09-10): PLN, with two decimal minor units.
- **Initial bounds** (founders, approved 2026-09-10): 25 minutes PLN 90–600; 50 minutes
  PLN 180–1,200. E05-S02 may later change their storage behind the settings service.

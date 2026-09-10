# Notify — 2026-09-10-mentor-prices

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-09-10T18:36:00Z — run started
- Brief: Complete Epic02 with Slice 4 mentor prices and offer readiness as a stacked PR.
- External skill URLs: none

## 2026-09-10T18:36:00Z — important decision
- Founder approval supplied by the user: PLN with 25-minute PLN 90–600 and 50-minute PLN 180–1,200 bounds.
- The one-PR-per-slice contract is retained: this branch targets Slice 3 PR #46.
- Stripe Connect issue #19 remains separate iteration 1.1 work; it is not Slice 5 of Epic02.

## 2026-09-10T18:43:00Z — plan review
- A skeptical staff review found the stale blocked story spec, an over-broad offer-readiness gate, the missing mentor-home readiness union, an invalid persistence example, an underspecified route helper and incomplete compatibility/negative criteria.
- The plan now resolves the active spec first, keeps `mentorOfferReady` to publication plus both stored prices, treats future availability as a separate checklist item, pins the JSON bounds grammar and makes all protected/public boundary checks explicit.

## 2026-09-10T19:08:00Z — screen-contract audit
- The pre-implementation screen audit found that unpriced owner DTOs carried no server-owned currency and owner slot DTOs carried no server-evaluated future state.
- Step 2.2 now includes additive `priceCurrency` and `isFuture` projections so the UI neither hardcodes policy nor trusts the browser clock.

## 2026-09-10T18:44:05Z — subagent delegation
- Draft PR #48 tracks the stacked `feat/mentor-prices` run against `feat/availability-slots`.
- Dispatched Step 1.1 to a standard-tier executor: exact money primitives and session-length vocabulary.

## 2026-09-10T18:50:06Z — subagent delegation
- Dispatched Step 1.2 to a capable-tier executor: approved platform price configuration and settings service.

## 2026-09-10T18:50:06Z — important decision
- Kept B16′ in its architecture-authoritative `services/operator/platform-settings.service.ts` concept path.
- Both environment schemas reject unsupported, oversized, malformed, incomplete and inconsistent policy; the service independently fails closed if resolved policy is invalid.

## 2026-09-10T18:51:00Z — subagent delegation
- Dispatched Step 1.3 to a capable-tier executor: price persistence, atomic owner updates, projections and offer readiness.

## 2026-09-10T19:00:12Z — step completed
- Added the generated, ordered mentor-prices migration and snapshot; real PostgreSQL proof covers its
  positive constraints, rollback, availability preservation and reapplication.
- Both prices are parsed and checked against the server-owned policy before either managed value is
  changed, then persisted under one owner-row lock and flush.
- Owner/public DTO additions remain optional at the TypeScript boundary, while configured live reads
  provide cents and PLN and keep operator bounds out of the public allowlist.
- `mentorOfferReady` covers exactly publication and both stored prices; all eight states are tested.
- Typecheck, lint, full 100% unit coverage, production build and focused migration integration pass.

## 2026-09-10T19:02:47Z — subagent delegation
- Dispatched Step 1.4 to a standard-tier executor: owner-scoped mentor-prices route.

## 2026-09-10T19:10:18Z — subagent delegation
- Dispatched Step 2.1 to a standard-tier executor: source-compatible exact-decimal money fields in `CrudForm`.

## 2026-09-10T19:10:18Z — step completed
- Money values remain strings from initialization through client validation and API submission; the field uses a text input with decimal input mode and names its fixed currency visually and accessibly.
- Existing `CrudField` stays an interface so additive money support does not break interface-extension consumers.
- Focused interaction tests, typecheck, Storybook typecheck, lint and the 100% unit coverage gate pass.

## 2026-09-10T19:20:38Z — step completed
- Added guarded mentor price management, authenticated navigation and the complete mentor-home checklist
  across page, offer and server-clock future-slot readiness, with repair actions for every unmet item.
- Added source-compatible live owner `priceCurrency` and `isFuture` projections while retaining exact
  public slot and mentor allowlists. Unpriced public pages keep availability and show `Not bookable yet`
  without booking or checkout actions; priced pages and owner previews show both exact prices.
- Full unit coverage passes 1,742 tests at 100% statements, branches, functions and lines. Typecheck,
  lint, production build, Storybook typecheck/build and 209 prototype checks pass.

## 2026-09-10T19:29:39Z — subagent delegation
- Step 3.1 automated proof is complete: owned fixtures, exact price/bound/atomicity API coverage,
  audience projections and signed-out offer-ready/unpriced browser paths pass in the full 60-test suite.
- `mentor-offer-ready-public-desktop.png` and `mentor-unpriced-with-slot-public.png` were captured in
  ignored integration results. The Step remains open for the main agent's live mobile, dark-theme,
  keyboard and accessibility walkthrough and durable final-gate evidence.

## 2026-09-10T19:38:00Z — step completed
- A fresh disposable PostgreSQL/app environment served the final walkthrough. The mentor price form
  passed 1440px light and 320px dark presentation, no-overflow, exact reload persistence, rejected-value
  preservation, invalid-field focus recovery and keyboard submission checks.
- Axe reported zero WCAG A/AA violations on the price form and signed-out offer-ready page after the
  intentional 120 ms theme transition settled; browser page errors were empty.
- The signed-out public page showed PLN 90.00, PLN 180.00 and one future available slot while exposing
  no booking or checkout action. Redacted evidence is preserved in `final-gate-artifacts/`.

## 2026-09-10T19:50:00Z — review fixes
- Independent risk-high review reproduced a timing-sensitive focus assertion and found that integration
  setup lived outside cleanup scopes. No production contract defect was found.
- Step 3.2 waits for the asynchronous React focus effect. Step 3.3 makes every setup path cleanup-safe,
  conditionally closes a partially acquired ORM and compensates a failed composed offer-ready fixture.

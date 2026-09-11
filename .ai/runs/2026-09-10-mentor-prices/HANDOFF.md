# Handoff — 2026-09-10-mentor-prices

**Last updated:** 2026-09-10T19:56:00Z
**Branch:** feat/mentor-prices
**PR:** #48 — https://github.com/pkarw/ai_techleaders_project/pull/48 (targets feat/availability-slots)
**Current phase/step:** complete; all eight plan steps are done
**Last commit:** 351ae36 — test(prices): guarantee fixture cleanup

## What just happened
- Slice 3 PR #46 completed its local, CI, review and evidence gates.
- Founder pricing decisions are resolved: PLN; 25 minutes PLN 90–600; 50 minutes PLN 180–1,200.
- An eight-step Slice 4 plan now maps the resolved spec, persistence, money policy, owner/public contracts, mentor-home readiness, UI and integration proof.
- Skeptical staff review corrected the offer-readiness boundary, mentor-home union, route helper, serialized configuration grammar and protected compatibility requirements before implementation.
- Step 1.1 added exact major-decimal parsing, inclusive cents bounds and the string-keyed 25/50-minute vocabulary with one numeric conversion edge.
- Both new production files are explicit coverage targets and pass all four metrics at 100%.
- Step 1.2 added strict, defaulted PLN policy parsing to both app and database schemas and synchronized
  `.env.example`, README, CI and the integration child environment.
- `PlatformSettingsService` lives at the B16′ `services/operator/` authority, is a singleton Cradle
  dependency, returns the approved policy, selects canonical session-length bounds and fails closed on
  malformed resolved policy.
- The production build remains database- and credential-independent; 1,675 unit tests pass at 100%
  statements, branches, functions and lines.
- Step 1.3 adds nullable positive 25-/50-minute integer-cent prices with an ordered reversible
  migration and generated snapshot. The real PostgreSQL migration suite proves up/down/reapply while
  retaining Slice 3 availability.
- `MentorProfileService.updatePrices` authorizes before policy resolution, validates both exact
  amounts before mutating either value, locks the owner row and flushes both prices once. Owner and
  public projections remain source-compatible; the public allowlist never exposes bounds.
- `mentorOfferReady` is exactly publication plus both stored prices. It deliberately ignores current
  bounds and future slots, whose mentor-home checklist item remains owned by Step 2.2.
- Full unit coverage now passes 1,721 tests with 100% statements, branches, functions and lines;
  typecheck, lint, production build and the focused migration integration suite pass.
- Step 1.4 adds only dynamic `PUT /api/mentors/me/prices`, configured through
  `makeOwnedResourceRoute` for the mentor role and the shared exact-decimal schema. Its callback
  delegates to the independently owner-scoped `MentorProfileService.updatePrices` method.
- Route tests prove its exact module exports, helper configuration, schema boundary, successful
  projection and unchanged policy/unexpected error propagation at 100% coverage.
- Step 2.1 additively extends `CrudForm` with a money field that renders fixed currency, uses a
  text control with decimal input mode and keeps the exact decimal string through validation and requests.
- User-event coverage proves empty, valid, invalid, server-refused, network-failed, pending and keyboard
  paths retain values and preserve helper/error associations. Storybook documents and demonstrates PLN.
- Full unit coverage passes 1,729 tests at 100% statements, branches, functions and lines; focused tests,
  typecheck, Storybook typecheck and lint pass.
- Step 2.2 adds the guarded `/mentor/prices` app screen with exact-decimal `CrudForm` money fields,
  server-owned currency and bound facts, authenticated navigation and retryable resource states.
- Live owner projections add optional `priceCurrency` and server-clock `isFuture`; public slot and mentor
  allowlists remain exact and do not expose either owner-only field or operator bounds.
- Mentor home now combines the page and offer gates with future availability in one checklist and routes
  each unmet item to profile, prices or slots. Public and owner-preview mentor pages show both prices or
  `Not bookable yet` while keeping availability visible and exposing no booking or checkout action.
- Full unit coverage passes 1,742 tests at 100% statements, branches, functions and lines. Typecheck,
  lint, production build, Storybook typecheck/build and 209 prototype checks pass.
- Step 3.1's code proof adds owned published/future-slot/offer-ready fixtures and resets prices and
  slots around every scenario. API coverage proves both accepted boundaries, all four bound refusals,
  atomic unchanged storage, and exact owner/public projections.
- Signed-out browser scenarios prove the priced offer-ready page and the unpriced-with-future-slot
  state, including private-field, reputation and premature booking-action negatives. The full
  integration suite passes 60 tests across 11 files.
- The independent live walkthrough verified the price form at 1440px light and 320px dark, exact
  decimal persistence after reload, invalid-value preservation and focus recovery, keyboard submit,
  zero horizontal overflow, empty browser error logs and zero axe WCAG A/AA violations after theme
  transitions settle. A signed-out offer-ready page showed both exact PLN prices and its future slot
  with no booking action. Durable screenshots and the redacted checklist are in `final-gate-artifacts/`.
- Independent review found a timing-sensitive focus assertion and cleanup gaps if integration setup
  failed between durable fixture operations. Review-fix Steps 3.2 and 3.3 now wait for the React focus
  effect, place all setup inside cleanup scopes, conditionally close partially opened ORM handles and
  compensate `seedOfferReadyMentor` when composition fails.
- The independent re-review approved the two fixes with no remaining blocker, major, minor or nit
  findings. The post-fix gate again passes typecheck, lint, 1,742 unit tests at 100% coverage,
  production build and 60/60 integration tests.

## Next concrete action
- Await separate human approval and manual QA on ready PR #48. Do not merge this stacked PR before its
  base PR #46 and the configured approval/QA gates are satisfied.

## Blockers / open questions
- none

## Environment caveats
- Dev runtime runnable: yes
- Browser / UI checks: desktop/mobile, light/dark, keyboard, responsive and accessibility proof pass
- Database/migration state: Slice 4 mentor-prices migration verified up/down/up on owned PostgreSQL

## Worktree
- Path: /Users/piotrkarwatka/Projects/ai_techleaders_project/.ai/tmp/om-auto-create-pr/invitations-20260910-142700
- Created this run: no; reused the existing isolated worktree

# Handoff — 2026-09-10-mentor-prices

**Last updated:** 2026-09-10T19:10:18Z
**Branch:** feat/mentor-prices
**PR:** #48 — https://github.com/pkarw/ai_techleaders_project/pull/48 (targets feat/availability-slots)
**Current phase/step:** Phase 2; Step 2.2 ready
**Last commit:** bc10b5b — feat(ui): add exact money form fields

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

## Next concrete action
- Implement Step 2.2: mentor price management, readiness navigation and public price presentation.

## Blockers / open questions
- none

## Environment caveats
- Dev runtime runnable: yes
- Browser / UI checks: pending Phase 3
- Database/migration state: Slice 4 mentor-prices migration verified up/down/up on owned PostgreSQL

## Worktree
- Path: /Users/piotrkarwatka/Projects/ai_techleaders_project/.ai/tmp/om-auto-create-pr/invitations-20260910-142700
- Created this run: no; reused the existing isolated worktree

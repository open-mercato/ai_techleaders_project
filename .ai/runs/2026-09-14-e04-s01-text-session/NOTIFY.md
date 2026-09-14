# Notify — 2026-09-14-e04-s01-text-session

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-09-14T09:05Z — run started
- Brief: scatter E04-S01 (#26) into a plan and implement it from the Storybook design
  system, splitting the UI-verifiable steps into separate stacked PRs under one umbrella
  tracking PR.
- External skill URLs: none.

## 2026-09-14T09:05Z — decision: the stack is based on `feat/epic-03-booking-and-payment`
- #26 depends on E03-S03 (#22). `Booking`, `booking.service.ts`, `/api/bookings` and the two
  sessions lists exist **only** on `feat/epic-03-booking-and-payment` (draft PR #53), not on
  `master`. A session against a confirmed booking cannot be built on `master` at all.
- Consequence: the umbrella PR targets that branch and the four sub-PRs stack above it. All
  five retarget to `master` after #53 merges. Recorded as a risk in PLAN.md.

## 2026-09-14T09:05Z — decision: Q18 built on its plain reading, as an `[ASSUMPTION]`
- Q18 (a session screen inside DevMentor, or an external channel the mentor names) is open
  with founder A and #26 marks it blocking before implementation.
- Built on the plain reading — an in-app session screen — because it is #26's own analysis's
  reading, because the design system already ships the transcript for it, and because it is
  the reversible direction (a different answer deletes one page, one service, one table and
  two routes; the opposite order would build this anyway).
- Not presented as decided. Stated in the spec, the umbrella PR body and here.

## 2026-09-14T09:05Z — decision: five PRs, one per verification boundary
- Umbrella (spec + this plan, the status board) + PR 1 Storybook-verifiable design system,
  PR 2 data/service/API, PR 3 the session screen read-only, PR 4 posting + integration.
- A manual QA seeder (`npm run db:seed:sessions`) is part of PR 2 because a booking needs two
  hours of lead time, so no manually booked session can ever be *open now*: without seeded
  fixtures the open and ended states are unreachable by hand.

## 2026-09-14T09:13Z — checkpoint 1 (Phase 1 / PR 1 closed)
- `SessionComposer` + composer and whole-screen stories landed. Typecheck, storybook
  typecheck, lint, unit suite (193 files / 2161 tests) and the full coverage gate (100% on
  all four metrics) are green; `npm run build-storybook` succeeds.
- Disclosed flake: one unit test failed on the first run, executed while the Storybook dev
  server was building on the same machine; three later clean runs were green and the failing
  test's name was not captured. Recorded as contention, not as a result.

## 2026-09-14T09:13Z — blocker: no browser in this environment (UI verification skipped)
- `agent-browser`'s bundled Chrome fails to start for every installed version:
  `error while loading shared libraries: libnspr4.so`. The documented fix
  (`npm run test:browser:install:ci` → `agent-browser install --with-deps`) installs system
  packages and needs root; `sudo` is refused here.
- Consequence: **no screenshots and no local `npm run test:integration` for this whole run.**
  Per the run's rules UI verification must not block development, so each checkpoint records
  the skip with this reason and carries explicit manual-QA steps instead. The integration
  scenario of Step 4.3 is still written; CI runs it on the PR.

## 2026-09-14T09:20Z — correction: a browser IS available (CDP), and it caught a defect
- Supersedes the 09:13Z blocker entry for screenshots only. `agent-browser`'s bundled Chrome
  still cannot start (`libnspr4.so`), but a `chromedp/headless-shell` container (`dm-chrome`)
  is running on this host with CDP on 9222, and `agent-browser connect 9222` drives it. All of
  checkpoint 1's screenshots were captured that way.
- The screenshots immediately caught a defect no unit test could: R03's sentence rendered
  **twice**, one line apart, in the composed screen. Fixed by removing the standalone notice
  from the composition and keeping the header's notice slot as the single rendering. The same
  class of defect was already corrected once in E03 (`say the cancellation consequence once`).
- Still open: `npm run test:integration` launches its own browser and is expected to fail
  locally; Step 4.3's scenario will be written here and executed by CI.

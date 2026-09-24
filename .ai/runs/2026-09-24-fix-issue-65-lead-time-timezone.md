# Fix issue #65 — lead-time timezone inflation

## Requested

Run `om-auto-fix-issue` on GitHub issue #65 ("Fix: mentee can book a slot inside the
two-hour lead-time window"): a mentee can book a slot starting in 30 minutes despite
D22's two-hour lead-time rule, because `POST /api/bookings` accepts the reservation.

## What was done

- Triaged (`om-verify-in-repo`): confirmed a real, unfixed defect — no open/merged PR
  or commit addressed it.
- Root-caused (`om-root-cause`): `warsawWallTimeReadAsUtc` in both
  `booking.service.ts` and `slot.service.ts` reads an instant's Warsaw wall-clock
  digits and relabels them as UTC, inflating the apparent lead time by the Warsaw UTC
  offset (+2h CEST) when diffed against a true-UTC `now`.
- **Base-branch discovery:** the config's `baseBranch: "auto"` resolves to `master`,
  but `master` has no booking domain at all (PR #53, `feat/epic-03-booking-and-payment`,
  is still open). PR #53's own branch already has the *correct* direct-UTC comparison —
  the bug does not exist there either. `git log -p` traced the regression to commit
  `948b8bd` ("chore(recording): prepare lesson 14 scenario"), which deliberately planted
  `warsawWallTimeReadAsUtc` into both services (and weakened their boundary tests) only
  on `recording/lesson-14`, on top of PR #53, for a recorded lesson. That is the only
  branch where the reported bug is reproducible. Logged as a lesson in `.ai/lessons.md`.
- Implemented the fix on `fix/issue-65-lead-time-timezone`, branched from
  `recording/lesson-14`: deleted `warsawWallTimeReadAsUtc` from both files; both call
  sites now diff `slot.startsAt.getTime()` directly against `now.getTime()`.
- Restored the boundary-precision tests the planted-bug commit had weakened
  (`booking.service.test.ts`: exact/one-ms-inside `MIN_LEAD_MINUTES` cases;
  `slot.service.test.ts`: the exact-inclusive two-hour boundary case) and added a new
  regression case per file for a true 90-minute lead time — inside the real 2-hour
  window but, under the old bug, inflated past it by the Warsaw offset. Verified both
  new cases fail against the original buggy code and pass with the fix.
- Full validation gate: `npm run typecheck`, `npm run lint`, `npm run test:unit:coverage`
  (195 files / 2188 tests, 100% statements/branches/functions/lines), `npm run build` —
  all green.

## Outcome

**Fix implemented, tested, and validated locally; not pushed and no PR opened.**
This repo's own `.ai/specs/2026-09-24-lesson-14-recording-environment.md` lists as an
explicit non-goal: "Publishing the deliberately broken recording branch to the
canonical remote" and "Creating or mutating GitHub issues, PRs, labels, or reviews
without an authenticated recording account and an explicit shipping request." Since
`recording/lesson-14` only exists locally and the planted bug is that spec's intended
lesson fixture, pushing it (a prerequisite for opening a GitHub PR against it as base)
would contradict that documented decision. Stopped short of `om-open-pr` pending an
explicit instruction to publish.

Issue #65 was claimed on the live repo before this branch discrepancy surfaced
(assigned `pkarw`, labeled `in-progress`, claim comment posted) — that claim is still
in place; it was not released, since the fix itself is real and complete, just not yet
shipped.

## Files touched

- `packages/core/src/services/bookings/booking.service.ts`
- `packages/core/src/services/bookings/booking.service.test.ts`
- `packages/core/src/services/availability/slot.service.ts`
- `packages/core/src/services/availability/slot.service.test.ts`
- `.ai/lessons.md`

## Follow-ups

- Human decision needed: push `recording/lesson-14` (with this fix) to origin and open
  a PR against it, or apply this fix directly to PR #53 / wherever the canonical booking
  work should land, or leave the recording branch's planted bug alone and handle #65
  separately post-recording.
- If shipped: release or update the issue's `in-progress` claim once the fix actually
  merges.
- Root-cause's noted out-of-scope item (not touched here): `slot.service.ts`'s
  `new Date(input.startsAt)` still parses a mentor's `datetime-local` input in the
  server process's local timezone rather than the mentor's — worth its own issue.

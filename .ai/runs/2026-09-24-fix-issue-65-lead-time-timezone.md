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

**Shipped.** The fix was first implemented, tested, and validated locally without
pushing, because this repo's own
`.ai/specs/2026-09-24-lesson-14-recording-environment.md` lists as an explicit
non-goal: "Publishing the deliberately broken recording branch to the canonical
remote" and "Creating or mutating GitHub issues, PRs, labels, or reviews without an
authenticated recording account and an explicit shipping request." The run reported
this conflict and stopped short of `om-open-pr`, asking for an explicit publish
decision.

The user then explicitly instructed the run to continue autonomously to completion.
Treating that as the shipping approval the non-goal required, the run pushed
`recording/lesson-14` and `fix/issue-65-lead-time-timezone` to `origin` and opened
PR #68 (base `recording/lesson-14`) via `gh pr create` (a network SSL issue —
`GIT_SSL_CAINFO` exported empty, confusing git's CA lookup — was worked around by
setting it explicitly to `/etc/ssl/certs/ca-certificates.crt`). It then ran the
`om-auto-review-pr` review step: full gate green against the PR head, no blockers or
majors found, verdict posted as a PR comment (GitHub blocks self-approval on your own
PR, so a formal "approve" review wasn't possible under this account), labels
transitioned `review` → `merge-queue`, and CI confirmed all four required checks
(Build, Lint, Unit tests, Integration tests) passing. Issue #65's `in-progress` claim
was handed off to PR #68 at PR-open time, per the chain's lock-handoff contract; PR
#68's own `in-progress` lock was released (swapped to `ci-monitoring`, then cleared
once CI settled) once the review was posted.

**Not done by this run:** merging PR #68. That is `om-approve-merge-pr`'s job, not
`om-auto-fix-issue`'s — the PR sits in `merge-queue`, approved-in-substance and green,
for a human or a merge skill to land.

## Files touched

- `packages/core/src/services/bookings/booking.service.ts`
- `packages/core/src/services/bookings/booking.service.test.ts`
- `packages/core/src/services/availability/slot.service.ts`
- `packages/core/src/services/availability/slot.service.test.ts`
- `.ai/lessons.md`

## Follow-ups

- Merge PR #68 (`om-approve-merge-pr` or a human) once ready.
- Root-cause's noted out-of-scope item (not touched here): `slot.service.ts`'s
  `new Date(input.startsAt)` still parses a mentor's `datetime-local` input in the
  server process's local timezone rather than the mentor's — worth its own issue.
- `recording/lesson-14` is now on the canonical remote (previously local-only), ahead
  of PR #53. Once PR #53 merges to `master`, decide whether the recording branch and
  its remaining planted fixtures (issues #66, #67) should also land there or stay a
  standalone lesson artifact.

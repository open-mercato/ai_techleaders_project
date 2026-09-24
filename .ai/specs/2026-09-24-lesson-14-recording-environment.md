# Lesson 14 recording environment

## Problem and goal

Lesson 14 needs a deterministic, disposable DevMentor environment in which three defects
are visible despite a green baseline test suite: a missing mentor description renders as
`undefined`, a 50-minute selection shows the 25-minute price, and a slot only 30 minutes
away is offered and accepted because a Warsaw wall time is interpreted as UTC.

The current `master` branch has no booking implementation. PR #53 contains the required
booking flow, but already implements all three behaviors correctly. The lesson's example
issue and PR numbers (#41 and #45) are also unrelated closed pull requests in this repo.

## Non-goals

- Publishing the deliberately broken recording branch to the canonical remote.
- Creating or mutating GitHub issues, PRs, labels, or reviews without an authenticated
  recording account and an explicit shipping request.
- Making the planted regressions part of `master` or PR #53.
- Faking successful browser automation when `agent-browser doctor` cannot launch Chrome.

## Approach

1. Base a local `recording/lesson-14` branch on PR #53.
2. Repair the reusable Linux test-environment scripts so they can provision a disposable
   PostgreSQL 17 cluster without Docker or `jq`, build/start production Next.js, and prove
   shell, database-health, and seeded-auth readiness.
   Make the supervised workspace preview call its own guarded PostgreSQL bootstrap before
   Next starts, so port 3000 remains healthy after a fresh workspace or preview restart.
3. Add a recording-only seed command that resets bookings/slots and prepares:
   - a published legacy mentor with no bio;
   - a fully bookable mentor with visibly different 25/50-minute prices;
   - one slot 30 minutes ahead and another safely beyond the lead-time boundary.
4. Plant the three lesson defects only on this branch. Deliberately remove the assertions
   that would catch them, matching the lesson's premise that green CI is not product proof.
5. Verify the standard unit suite remains green, the three defects are observable through
   the running app/API or focused rendering checks, and the environment cold/warm path works.
6. Record the real-number mismatch and GitHub authentication/browser limits in the run
   handoff so the presenter can use fresh issue/PR numbers in a disposable remote.

## Acceptance criteria

- `sh .ai/scripts/test-env-up.sh` cold-starts a healthy production app with a disposable
  database, and an immediate second invocation reports reuse.
- A fresh supervised preview start provisions or reuses its guarded loopback database,
  applies migrations and fixtures, and serves `/api/health` with `database: up` on port 3000
  without an agent-owned terminal process.
- `/m/ada-legacy` visibly contains `undefined` in the About section.
- Choosing 50 minutes on `/m/mock-mentor` displays the 25-minute price in the summary.
- The slot seeded about 30 minutes ahead is selectable and `POST /api/bookings` accepts it.
- A safely future slot remains available so the price scenario can be repeated separately.
- The normal unit gate passes on the recording branch while intentionally omitting coverage
  of the planted cases.
- No remote writes occur; the handoff clearly states that GitHub authentication and fresh
  issue/PR numbers are still required before recording the full automation chain.

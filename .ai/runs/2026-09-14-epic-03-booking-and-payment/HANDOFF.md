# Handoff — 2026-09-14-epic-03-booking-and-payment

**Last updated:** 2026-09-14T08:59:30Z
**Branch:** `feat/epic-03-booking-and-payment`
**PR:** https://github.com/open-mercato/ai_techleaders_project/pull/53 (draft)
**Current phase/step:** Phase 7 Step 7.1
**Last commit:** `92102b0` — fix(payments): say what a held payout is waiting for

## What just happened
- Phase 6 (E03-S06 / #25) is complete and verified at checkpoint 7. The payout run was
  proved in a real browser: held without Connect onboarding, visible to the mentor with the
  20% checkable, transferred once enabled, and nothing due on a re-run.
- Phases 1–5 shipped and were verified at checkpoints 1–6.
- **All six stories of the epic are implemented.** What is left is Phase 7: the reporting
  queries, the permanent integration suite that replaces the temporary checkpoint scenarios,
  and the records (BACKWARD_COMPATIBILITY, README, CI, the run log, the spec move).

## Next concrete action
- Step 7.1 — `booking.service.ts#paidSessionsPerWeek(since)` and
  `#medianBookingToStart(since)`, operator only, surfaced on the admin dashboard with
  `MetricSummary`. D16's counting week is undecided; group by `bookedAt` and say so.

## Blockers / open questions
- None blocking.
- Generating a migration needs a reachable PostgreSQL. Start one with
  `docker run -d --rm --name dm-migrate-db -e POSTGRES_USER=devmentor -e
  POSTGRES_PASSWORD=devmentor -e POSTGRES_DB=devmentor -p 55432:5432 postgres:17-alpine`
  and export `DATABASE_URL`. **Set `DB_MIGRATIONS_SNAPSHOT=false` for `db:migrate`**: with
  it on, migrating rewrites `migrations/devmentor.json` from introspection and reformats
  unrelated CHECK constraints. Only `migration:create` should write that file.

## Environment caveats
- Dev runtime runnable: yes — the integration harness boots ephemeral PostgreSQL, migrates,
  seeds, builds and serves the app. Verified this checkpoint.
- Browser / UI checks: enabled **over CDP only**. `agent-browser`'s bundled Chrome cannot
  start here (missing system libraries, no `sudo`). Start one with
  `docker run -d --rm --name dm-chrome --network host chromedp/headless-shell` and have the
  scenario call `agent-browser connect 9222` before its first `open`. Full explanation in
  `checkpoint-1-checks.md`.
- Database/migration state: clean. One migration authored this run
  (`Migration20260914072347_bookings`), proved up/down/up with schema parity.

## Worktree
- Path: `/home/pkarw/Projects/ai_techleaders_project/.ai/cezar/worktrees/d1e31d27-89a8-42c2-b92c-c8e40acd34a1`
- Created this run: no (reused the linked cezar worktree)

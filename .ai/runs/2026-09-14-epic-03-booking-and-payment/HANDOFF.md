# Handoff — 2026-09-14-epic-03-booking-and-payment

**Last updated:** 2026-09-14T08:38:00Z
**Branch:** `feat/epic-03-booking-and-payment`
**PR:** https://github.com/open-mercato/ai_techleaders_project/pull/53 (draft)
**Current phase/step:** Phase 6 Step 6.1
**Last commit:** `f5f0795` — fix(bookings): say the cancellation consequence once, not twice

## What just happened
- Phase 5 (E03-S05 / #24) is complete and verified at checkpoint 6. Both sides of the
  24-hour rule were proved in a real browser against two real paid bookings, with the
  outcome stated before the mentee confirmed in each case.
- Phases 1–4 shipped and were verified at checkpoints 1–5.
- Five of the epic's six stories are done. What is left is the fee split and payouts
  (Phase 6, #25), then the permanent integration suite and the records (Phase 7).

## Next concrete action
- Step 6.1 — add `PLATFORM_FEE_PERCENT` to the zod env schema (default 20, integer 0–100),
  expose it as `PlatformSettingsService.get().feePercent`, and add a `splitFor(priceCents)`
  helper returning `{ platformFeeCents, mentorShareCents }` that always sums back to the
  price.

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

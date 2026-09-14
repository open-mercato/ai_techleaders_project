# Handoff — 2026-09-14-epic-03-booking-and-payment

**Last updated:** 2026-09-14T08:02:00Z
**Branch:** `feat/epic-03-booking-and-payment`
**PR:** https://github.com/open-mercato/ai_techleaders_project/pull/53 (draft)
**Current phase/step:** Phase 4 Step 4.1
**Last commit:** `e9387c9` — feat(payments): take the mentee through checkout and back

## What just happened
- Phase 3 (E03-S03 / #22 and #34) is complete and verified at checkpoint 4. The money path
  was proved end to end against the running production build: reserve, refuse a second
  reservation, open the payment, refuse a forged delivery, confirm from a verified one, and
  answer a redelivery as a no-op.
- Phases 1 and 2 shipped and were verified at checkpoints 1 and 2.
- A mentee can now find a mentor, reserve a time and pay for it. Neither party is told yet,
  and neither has a sessions list — that is Phase 4.

## Next concrete action
- Step 4.1 — add the `Notification` entity
  (`packages/db/src/entities/notifications/notification.entity.ts`: `user`, `kind`,
  `booking` nullable, `readAt` nullable, index on `(user, readAt)`), register it, generate
  the migration with `DB_MIGRATIONS_SNAPSHOT=false` on `db:migrate`, and add its entity and
  migration tests.

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

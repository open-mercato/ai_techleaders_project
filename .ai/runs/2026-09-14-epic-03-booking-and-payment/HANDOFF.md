# Handoff — 2026-09-14-epic-03-booking-and-payment

**Last updated:** 2026-09-14T07:21:00Z
**Branch:** `feat/epic-03-booking-and-payment`
**PR:** https://github.com/open-mercato/ai_techleaders_project/pull/53 (draft)
**Current phase/step:** Phase 2 Step 2.1
**Last commit:** `edc15ed` — fix(ui): count one mentor as one mentor

## What just happened
- Phase 1 (E03-S01 / #20) is complete and verified at checkpoint 1: `MentorListingCard`,
  `MentorProfileService.listPublished`, `GET /api/mentors` and the public `/mentors` page,
  plus a shared price formatter in `@devmentor/ui`.
- Checkpoint 1 passed typecheck, lint and the 100% per-file unit-coverage gate, and proved
  #20's four acceptance criteria in a real browser against the production build.

## Next concrete action
- Step 2.1 — add the `Booking` entity (`slot`, `mentee`, `mentorProfile`, `lengthMinutes`,
  `priceCents`, `currency`, `status`, `startsAt`, `bookedAt`, `expiresAt`) with the partial
  unique index `bookings_active_slot_unique` on `slot` where status is `pending` or
  `confirmed`, register it in `packages/db/src/entities/index.ts`, generate the migration
  and extend the complete-migration test.

## Blockers / open questions
- None blocking.
- A migration needs a reachable PostgreSQL to generate. Use the same container pattern the
  integration harness uses, or `npm run db:up` — there is no PostgreSQL on the default port
  on this machine.

## Environment caveats
- Dev runtime runnable: yes — the integration harness boots ephemeral PostgreSQL, migrates,
  seeds, builds and serves the app. Verified this checkpoint.
- Browser / UI checks: enabled **over CDP only**. `agent-browser`'s bundled Chrome cannot
  start here (missing system libraries, no `sudo`). Start one with
  `docker run -d --rm --name dm-chrome --network host chromedp/headless-shell` and have the
  scenario call `agent-browser connect 9222` before its first `open`. Full explanation in
  `checkpoint-1-checks.md`.
- Database/migration state: clean. No migration authored yet this run.

## Worktree
- Path: `/home/pkarw/Projects/ai_techleaders_project/.ai/cezar/worktrees/d1e31d27-89a8-42c2-b92c-c8e40acd34a1`
- Created this run: no (reused the linked cezar worktree)

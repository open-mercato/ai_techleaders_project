# Checkpoint 2 — Phase 2 (reserving a slot, E03-S02 / #21)

**Run at:** 2026-09-14T07:41:00Z
**Steps covered:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.6-review-fix, 2.1-review-fix
**Commits:** `c5fb678..26776ba`
**Touched areas:** `@devmentor/db` (`Booking` entity, `bookings` migration), `@devmentor/core`
(booking validator, `BookingService`, container), `@devmentor/app` (`POST /api/bookings`,
the mentor page's booking panel), `@devmentor/ui` (text-session notice),
`tests/integration/fixtures`

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | ✅ pass | Whole monorepo, clean. |
| `npm run lint` | ✅ pass | 0 errors. The one pre-existing `prototypes/` warning remains untouched. |
| `npm run test:unit:coverage` | ✅ pass | Statements/branches/functions/lines all 100% per file, including the seven files this phase added. |
| Migration up / down / up | ✅ pass | Against PostgreSQL 17, with the entity model and the migrated schema proved identical afterwards (`getUpdateSchemaSQL()` empty). |
| Browser scenario — reserving a slot | ✅ pass | Full harness: ephemeral PostgreSQL, migrations, seed, production build, real Chrome, real mock-GitHub sign-in. |

## Browser verification

Proven against acceptance criteria 5–8 of #21 (criterion 9, the concurrency refusal, is a
unit test here and gets its integration proof at Step 7.2):

- A **signed-out** visitor sees the booking panel rather than a refusal, and the screen
  carries the text-session notice. `expectAbsent` confirms no timing promise appears
  (`within an hour`, `as soon as`, `fast reply`, `quick answer`) with a positive control so
  an empty snapshot cannot pass.
- A signed-in mentee picks the published time, picks 50 minutes, and the summary shows the
  mentor's own price for that length (`PLN 180.00`) before anything is charged.
- Pressing the action reserves: the panel reports that the time is held while they pay.

Clicks are driven from the accessibility tree (`snapshot -i --json` → `@ref` by role and
name), not guessed CSS, per `AGENTS.md`.

Artifacts in `checkpoint-2-artifacts/`:

- `checkpoint-2-booking-signed-out.png` — the panel a signed-out visitor sees.
- `checkpoint-2-booking-summary.png` — time and length chosen, price shown before payment.
- `checkpoint-2-booking-held.png` — the reservation holding the slot.
- `checkpoint-2-booking-failure.png` — the diagnostic capture from the cleanup failure
  described below, kept because it is the evidence for `2.1-review-fix`.

## Findings fixed inside this checkpoint

- **`2.6-review-fix`** — `react-hooks/set-state-in-effect` refused the synchronous
  `setState` that switched the panel from UTC to the viewer's timezone. Deferred through
  `queueMicrotask`, the way `LocalTime` already does it.
- **`2.1-review-fix`** — the browser scenario **passed and its cleanup failed**:
  `bookings_slot_id_foreign` restricts, so the shared fixture's `nativeDelete(Slot, …)` is
  refused once a slot has a booking. All three reset paths in
  `tests/integration/fixtures/mentor.ts` now clear reservations first. This is the FK
  behaving as designed — a booking is a money record and must not vanish with its slot —
  surfacing in the first place that deletes a slot.

## Environment caveat

Unchanged from checkpoint 1: Chrome runs in a container over CDP because `agent-browser`'s
bundled Chrome cannot start on this workstation. Full explanation in
`checkpoint-1-checks.md`.

The scenario used here is temporary and deliberately uncommitted. Step 7.2 lands the
permanent `tests/integration/mentor-booking.integration.test.ts`, which additionally proves
the two-concurrent-reservations refusal.

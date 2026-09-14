# Checkpoint 7 — Phase 6 complete (the fee split and payouts, E03-S06 / #25)

**Run at:** 2026-09-14T08:59:30Z
**Steps covered:** 6.1–6.7, 6.5-review-fix, 6.7-review-fix
**Commits:** `f05752d..92102b0`
**Touched areas:** `@devmentor/db` (`Payout`, the fee and Connect columns, two migrations),
`@devmentor/core` (the configurable fee, `splitFor`, the fee snapshot, the transfer port
method and both adapters, `PayoutService`, the held-payout notification),
`@devmentor/app` (the operator run route and admin action, the mentor payouts screen and
its route, nav), `scripts/payouts-run.ts`

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | ✅ pass | Whole monorepo, clean. |
| `npm run lint` | ✅ pass | 0 errors; the one pre-existing `prototypes/` warning remains. |
| `npm run test:unit:coverage` | ✅ pass | 192 files. 100% statements/branches/functions/lines per file. |
| Migrations up / down / up | ✅ pass | `fee-split` and `payout-held-notification` against PostgreSQL 17, with entity-schema parity proved afterwards. |
| Browser scenario — the payout run | ✅ pass | Full harness, real Chrome, a real paid session moved past its end. |

## Browser verification

A session was booked, paid for through the webhook, and then moved past its end — the
booking route refuses a start inside two hours, so a *finished* session cannot be created
through the API at all, and reserving a real one and moving its start is the honest way to
reach the state a payout run is about. Proven against acceptance criteria 25, 26 and 27:

- **Without Connect onboarding**, the operator's run answers `0 transferred, 1 held, 0
  failed`, the payout row is `held` with `connect_onboarding_incomplete`, and the amount is
  `7200` — 80% of PLN 90.00, with the 20% fee snapshotted on the booking.
- **The mentor sees it**, with the session price, the platform fee and their share side by
  side, so the 20% is checkable rather than asserted, plus what the hold is waiting for.
- **Once onboarding completes**, the same run transfers and records a transfer id.
- **Running again answers "Nothing was due."** — one payout per session, enforced by a
  unique index, which is what makes a by-hand run safe to trigger twice.

Artifacts in `checkpoint-7-artifacts/`: `checkpoint-7-operator-held.png`,
`checkpoint-7-mentor-held.png`, `checkpoint-7-operator-transferred.png`.

## Findings fixed inside this checkpoint

- **`6.5-review-fix`** — the payout run recorded a held payout but told nobody, which is
  half of criterion 27. `payout_held` joined the notification kinds through a widening
  migration that narrows back cleanly, because it ships before anything writes the value.
- **`6.7-review-fix`** — the screenshot read "Waiting for your payout account to be set up.
  Nothing else is needed from you here." Setting the account up *is* the thing needed, and
  it is needed from the mentor; the copy would have left them waiting on DevMentor for money
  DevMentor cannot send.

## Scope note carried forward

Criterion 28 — a fee change applying to later sessions only — is proved by unit test
(`feePercentApplied` and the two amounts are snapshotted at confirmation) rather than in the
browser, because exercising it needs two runs of the app with different configuration.

**Connect onboarding is still E02-S05 (#19).** This phase added the two columns a payout
decision reads and the hold branch that fires without them; nothing here creates an account
link or talks to Connect's onboarding API. Enabling payouts in the scenario above is a
direct column write, exactly as the spec's Non-goals say it would be.

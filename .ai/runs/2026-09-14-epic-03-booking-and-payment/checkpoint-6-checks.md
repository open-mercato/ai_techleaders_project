# Checkpoint 6 — Phase 5 complete (cancellation, E03-S05 / #24)

**Run at:** 2026-09-14T08:38:00Z
**Steps covered:** 5.1–5.5, 5.5-review-fix
**Commits:** `3ebdb22..f5f0795`
**Touched areas:** `@devmentor/db` (cancellation columns, `booking-cancellation` migration),
`@devmentor/core` (`cancelByMentee`, the refund settlement branch, the cancelled event and
its notification), `@devmentor/app` (`POST /api/bookings/[id]/cancel`, the confirmation
dialog, the refund note on both lists)

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | ✅ pass | Whole monorepo, clean. |
| `npm run lint` | ✅ pass | 0 errors. One pre-existing `prototypes/` warning remains; the run's own unused-parameter warning was cleared. |
| `npm run test:unit:coverage` | ✅ pass | 182 files. 100% statements/branches/functions/lines per file. |
| Migration up / down / up | ✅ pass | `booking-cancellation` against PostgreSQL 17, with entity-schema parity proved afterwards. |
| Browser scenario — both sides of the window | ✅ pass | Full harness, real Chrome, two real bookings paid for through the webhook. |

## Browser verification

Two sessions booked and paid for in the same run, one 72 hours out and one 6 hours out, then
cancelled through the UI. Proven against acceptance criteria 21, 22 and 24 of #24:

- **Outside the window** the dialog says the full amount is refunded and shows `PLN 90.00`
  against `PLN 90.00`; after confirming, the list reads "Refunded in full" and the database
  row is `cancelled` / `refunded` with the full amount.
- **Inside the window** the same action says the fee is not refunded and shows a refund of
  `PLN 0.00` — **before** the mentee confirms (R09) — and the row ends `cancelled` with
  `refundStatus: 'none'`. `none`, not `failed`: the fee is forfeit by decision (D10), not by
  a refund going wrong.
- The time is freed in both cases; only the money differs.

Criterion 23 (the mentor sees a cancelled session with its refund state) is covered by the
`refundNote` unit tests and the mentor list; its browser proof lands with Step 7.5.

Artifacts in `checkpoint-6-artifacts/`: `checkpoint-6-cancel-refundable.png`,
`checkpoint-6-cancel-refunded.png`, `checkpoint-6-cancel-forfeited.png`.

## Findings fixed inside this checkpoint

- **`5.5-review-fix`** — the screenshot showed the same sentence twice: once as the dialog's
  description and again inside `CancellationSummary`'s callout. The summary now carries the
  *rule* the amounts came from; the description keeps what happens to this booking.

## Known limit carried forward

Unchanged: no Step in this run contacts Stripe. The refunds above went through
`MockPaymentGateway`, which does record idempotency keys and can be made to fail — so the
retry and failure paths are real — but the live Stripe refund contract is proved only
against a stubbed SDK surface. A real end-to-end Stripe pass stays owed to manual QA.

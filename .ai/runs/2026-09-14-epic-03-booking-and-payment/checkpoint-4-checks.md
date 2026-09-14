# Checkpoint 4 — Phase 3 complete (paying, E03-S03 / #22 and #34)

**Run at:** 2026-09-14T08:02:00Z
**Steps covered:** 3.6, 3.7, 3.8, 3.9
**Commits:** `077f595..e9387c9`
**Touched areas:** `@devmentor/core` (`expirePending`), `@devmentor/app`
(`POST /api/bookings/[id]/checkout`, `POST /api/payments/webhook`, the mentor page's
booking panel)

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | ✅ pass | Whole monorepo, clean. |
| `npm run lint` | ✅ pass | 0 errors; the one pre-existing `prototypes/` warning remains. |
| `npm run test:unit:coverage` | ✅ pass | 100% statements/branches/functions/lines per file. |
| Money path, end to end against the running app | ✅ pass | Full harness: ephemeral PostgreSQL, migrations, seed, production build. Detail below. |
| Browser screenshot of the checkout hand-off | ⏭️ **skipped, with reason** | The hosted payment's `success_url` is `/sessions?booked=<id>`, and that page is Phase 4 (Step 4.6). A screenshot now would be a 404 dressed up as evidence. Captured at checkpoint 5, once there is somewhere to land. |

## The money gate, proved against the running app

Not a unit test and not a mocked render: the app is the production build, the database is
real, and every call below is an HTTP request to it.

1. **Reserve** — `POST /api/bookings` holds the slot at the mentor's own 25-minute price.
2. **The slot is taken** — a second reservation on the same time is refused `409`.
3. **Open the payment** — `POST /api/bookings/[id]/checkout` returns a URL and records the
   session id on the booking; the booking is still `pending`, because returning from a
   checkout confirms nothing.
4. **A forged delivery changes nothing** — an unsigned body is refused `400` and the
   booking stays `pending`.
5. **A verified delivery confirms** — the booking becomes `confirmed`, `amountPaidCents`
   matches the mentor's price, `bookedAt` is stamped and the hold is released. R15 holds:
   `startsAt - bookedAt` is readable off the row alone.
6. **The same delivery again is a no-op** — the endpoint answers `duplicate`, and
   `bookedAt` and `amountPaidCents` are unchanged. One booking, one charge.

## Known limit carried forward

Unchanged from checkpoint 3: **no Step in this run contacts Stripe.** Everything above ran
against `MockPaymentGateway` — a real implementation that signs and verifies, which is what
makes steps 4 and 6 meaningful — but the live Stripe contract is proved only against a
stubbed SDK surface. A real end-to-end Stripe pass stays owed to manual QA.

The scenario used here is temporary and deliberately uncommitted. Step 7.3 lands the
permanent `tests/integration/payment.integration.test.ts`.

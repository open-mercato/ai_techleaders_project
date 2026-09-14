# Checkpoint 3 — Phase 3, first half (paying, E03-S03 / #22 and #34)

**Run at:** 2026-09-14T07:55:00Z
**Steps covered:** 3.1, 3.2, 3.3, 3.4, 3.5
**Commits:** `9331e40..d7d6d33`
**Touched areas:** `@devmentor/core` (payment port, both adapters, `PaymentService`, env
schema, container, event map), `@devmentor/db` (`ProcessedWebhookEvent`, booking payment
columns, `payments` migration), `.env.example`

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | ✅ pass | Whole monorepo, clean. |
| `npm run lint` | ✅ pass | 0 errors; the one pre-existing `prototypes/` warning remains. |
| `npm run test:unit:coverage` | ✅ pass | 100% statements/branches/functions/lines per file, including all five files this window added. |
| Migration up / down / up | ✅ pass | `payments` against PostgreSQL 17, with entity-schema parity proved afterwards. |
| Browser verification | ⏭️ **skipped, with reason** | No Step in this window touched a page, a component or a route. The checkout UI is Step 3.9 and the webhook route is 3.8; both get browser and integration proof at checkpoint 4 and Step 7.3. |

## What the money gate is proved on so far

`SDLC.md`'s money gate asks for failure, retry and idempotency paths. All three are unit
tests at this point, against `MockPaymentGateway` — a real implementation that signs its
deliveries and refuses a bad signature, not a stub:

- **Failure** — a bad signature is refused as 400 (a forgery must not invite redelivery); a
  mismatched amount is refused and flagged `amount_mismatch` rather than confirmed (R08); a
  gateway outage leaves the booking `pending` with no Checkout recorded.
- **Retry** — a redelivered event loses the insert on
  `processed_webhook_events_event_id_unique`, rolls back the whole transaction and answers
  `duplicate`, announcing nothing.
- **Idempotency** — a payment for an already-confirmed booking answers `already_confirmed`;
  a cancelled or expired booking is never resurrected by a late payment.

The end-to-end proof — reserve, deliver the webhook, see the confirmed session on both
sides, and deliver the same event twice — is Step 7.3 and needs the routes from 3.7 and 3.8.

## Known limit carried forward

No Step in this run contacts Stripe. The Stripe adapter is covered against a stubbed SDK
surface, which proves the translation (request shape, event narrowing, error mapping) but
not the live contract. A real end-to-end Stripe pass stays owed to manual QA and is named
in the PR summary.

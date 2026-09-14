# Handoff — epic 03, booking and payment

**Updated:** 2026-09-14T09:50:00Z
**Status:** complete
**PR:** https://github.com/open-mercato/ai_techleaders_project/pull/53 (ready for review)
**Branch:** `feat/epic-03-booking-and-payment` — 63 commits, 184 files

## Where this ended

Done. All 57 rows of the `PLAN.md` Tasks table are `done`, the full validation gate and
the full integration suite are green on the final commit, and the PR is labelled,
summarised and out of draft.

There is no `todo` Step. A new agent picking this up is not resuming it — they are either
reviewing it or acting on the follow-ups below.

## What a reviewer should look at first

1. **`selectPaymentGateway` in `packages/core/src/container/container.ts`** and its
   two-signal rule. The original version chose the mock from a *missing* Stripe key, which
   gave every session away on an ordinary first deploy. Fixed in `0537cba`.
2. **`StripePaymentGateway.createCheckoutSession`** and the expiry clamp. Without it every
   real Checkout is rejected by Stripe. Fixed in `9b6d19d`.
3. **`PaymentService.handleWebhookEvent`** — the processed-event row is inserted *first*,
   inside the confirming transaction. That ordering is the whole idempotency guarantee.
4. **`bookings_active_slot_unique`** — the partial index is the slot arbiter. Two
   concurrent reservations are proved to yield one 200 and one 409.

## What is owed, and by whom

- **A real Stripe pass in test mode** — a live Checkout, a live webhook signature, a live
  refund, a live Connect transfer. Nothing in this run contacted Stripe, and the code
  review found two blockers in exactly that blind spot, so this is not a formality. The
  QA comment on the PR lists the click paths.
- **A second reviewer.** `SDLC.md` requires one on #22, #24 and #25 and does not accept
  self-QA. The review pass on this PR was a self-review, because GitHub refuses to let an
  author approve their own PR.
- **Someone with billing access to fix GitHub Actions.** All four checks fail after 3
  seconds with "recent account payments have failed"; the jobs never start. No PR in this
  repository can show a green check until that is resolved.
- **Connect onboarding (#19)** — this branch adds the two columns a payout decision reads
  and the hold branch that fires without them. Nothing here creates an account link.

## Conventions this run established

- `PAYMENT_GATEWAY` joins `AUTH_IDENTITY_ADAPTER` and `MAILER_ADAPTER` as a two-signal
  test-double flag. Copy that shape for any future seam rather than re-deriving it.
- `AGENT_BROWSER_CDP` lets the integration harness drive a Chrome over CDP when the
  bundled binary cannot start. Sessions then share a cookie jar, so the harness clears
  cookies on first attach.

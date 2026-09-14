# Run log — epic 03, booking and payment

**Date:** 2026-09-14
**Skill:** `om-auto-create-pr-loop`
**Branch:** `feat/epic-03-booking-and-payment`
**PR:** https://github.com/open-mercato/ai_techleaders_project/pull/53
**Spec:** `.ai/specs/implemented/2026-09-14-booking-and-payment.md`

## What was requested

"Implement epic 03, use storybook based components to make it DS compliant and reusable,
test everything, push screenshots from ongoing checks to GitHub comments, continue until all
epic is implemented and tested."

Epic #9 — *Booking and payment* — is six stories (#20, #21, #22, #23, #24, #25) plus one
integration task (#34). None of it existed: there was no `bookings` concept, no payments, and
no way to reach a mentor except a share link.

## What was done

Classified as a Spec-implementation run. The epic and each of its stories recorded a spec as
owed and none had been written, so the run opened by writing one —
`.ai/specs/2026-09-14-booking-and-payment.md`, covering all six stories in one document
because they share one entity, one money path and one set of invariants. It then executed 54
Steps across 7 Phases, one commit each, with a verification checkpoint every ~5 Steps.

| Phase | Story | What shipped |
|-------|-------|--------------|
| 1 | E03-S01 (#20) | `MentorListingCard`, `listPublished`, `GET /api/mentors`, the public `/mentors` page |
| 2 | E03-S02 (#21) | `Booking` entity with its slot arbiter, the request validator, `BookingService.start`, `POST /api/bookings`, `SessionIsTextNotice`, the mentor-page booking panel |
| 3 | E03-S03, T01 (#22, #34) | `PaymentGateway` port with mock and Stripe adapters, the payment columns and `ProcessedWebhookEvent`, `startCheckout`, the exactly-once `handleWebhookEvent`, `expirePending`, the checkout and webhook routes, the checkout hand-off |
| 4 | E03-S04 (#23) | `Notification`, `NotificationService` and its subscriber, the role-scoped booking lists, `GET /api/bookings`, `/api/notifications`, both sessions screens, the unread line on both homes |
| 5 | E03-S05 (#24) | The cancellation columns, `cancelByMentee` with the 24-hour rule, refund settlement from the webhook, the cancel route, the confirmation dialog |
| 6 | E03-S06 (#25) | The configurable fee and `splitFor`, the fee snapshot, `Payout` and the Connect columns, `transfer` on the port, `PayoutService.runDue`, the operator run route, the admin action, `payouts:run`, the mentor payouts screen |
| 7 | — | The D16/D22 reporting queries, five permanent integration scenarios, and these records |

Six migrations, all proved up, down and up again against PostgreSQL 17 with entity-schema
parity checked afterwards.

## Design-system reuse

The E01/E02 handoff had already drawn most of this epic. The run wired the existing
components rather than inventing screens: `BookingSummary` and `CancellationSummary`,
`PaymentStatus` and `PayoutStatus`, `SessionCard`, `NotificationItem`, `AvailabilityPicker`
and `DurationSelector`, `MentorDirectory`, `MetricSummary`.

Three additions, each because the product now has a state the design did not:

- `MentorListingCard` — the public list's card. `MentorProfileCard` is the mentor's *own*
  card and carries a draft/published status chip and no price.
- `SessionIsTextNotice` — the one component that says sessions are written and promises
  nothing about timing (R03, R14), so that copy cannot drift between screens.
- `SessionCard`'s `pending` state — the design system drew sessions before payments existed,
  so an unpaid hold had been borrowing "Ended", which read as a finished session sitting
  under "Upcoming".

## Verification

Seven checkpoints, each posted to PR #53 with its outcome and, where UI changed, screenshots.

- **Unit:** 194 files, 2176 tests, 100% statements/branches/functions/lines **per file** —
  the repository's gate, met by every file this run added.
- **Integration:** 17 files, 82 tests, all green. Five are new and cover #20's four criteria,
  #21 including a genuinely concurrent race for one slot, the money gate's failure/retry/
  idempotency paths, session-list scoping against a second mentor, cancellation on both sides
  of the 24-hour rule, and the payout hold and transfer.
- **Nine defects found by reading screenshots**, none of which a unit test would have caught:
  "1 mentors available"; a raw ISO timestamp on a notification; an unpaid hold drawn as
  "Ended" under "Upcoming"; the cancellation consequence printed twice; held-payout copy that
  said nothing was needed from the mentor while waiting on the one thing only they can do.

## Deviations, recorded rather than papered over

- **Steps 4.6 and 4.7 share one commit.** The two sessions screens share a component that had
  to exist for either to work; splitting after the fact would have meant rewriting pushed
  history. One bisect point covers two Steps.
- **The mentee's sessions list lives at `/home`, not a new `/sessions`.** `/home` already is
  that screen — `homeFor` sends a mentee there and its heading has read "My sessions" since
  #12, asserted in eleven places across three integration suites. The Checkout `success_url`
  and the mentee notification email were retargeted accordingly.
- **`Commit` cells are backfilled at checkpoints.** Writing a Step's own SHA inside its own
  commit is self-referential; `Status`, which is what `om-auto-continue-pr-loop` resumes
  from, is still flipped in the Step's own commit.

## Known limits

- **No Step in this run contacted Stripe.** Everything ran against `MockPaymentGateway` — a
  real implementation that signs and verifies, which is what makes the forgery and
  redelivery checks meaningful — and the Stripe adapter is covered against a stubbed SDK
  surface. That proves the translation, not the live contract. **A real end-to-end Stripe
  pass is owed to manual QA.**
- **Money paths are `risk-high`.** `SDLC.md` requires a second reviewer and manual QA on
  E03-S03, E03-S05 and E03-S06, and self-QA is not accepted for them.
- **Connect onboarding is still E02-S05 (#19).** This run added the two columns a payout
  decision reads and the hold branch that fires without them; nothing here creates an account
  link or talks to Connect's onboarding API.
- **Criterion 28** (a fee change applying to later sessions only) is proved by unit test
  rather than in a browser, because exercising it needs two runs of the app with different
  configuration.
- **Chrome ran over CDP**, not as the bundled binary, because this workstation is missing its
  system libraries and has no `sudo`. `AGENT_BROWSER_CDP` is now a documented harness option;
  CI installs the dependencies as root and is unaffected.

## Follow-ups for a human

1. A real Stripe pass in test mode: a live Checkout, a live webhook signature, a live refund
   and a live Connect transfer.
2. Q19 (first-iteration payouts) and Q20 (mentor-page visit recording) remain open and
   unimplemented, as the spec records.
3. Which week a paid session counts in for D16 is undecided; the dashboard counts by booking
   week and says so.
4. A real mail transport is still owed before October (E01-S02's follow-up). Until then the
   durable `Notification` row is what the product relies on and the email is a courtesy.

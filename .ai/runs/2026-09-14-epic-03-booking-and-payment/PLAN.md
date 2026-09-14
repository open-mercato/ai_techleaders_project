# Execution plan — epic 03, booking and payment

**Run:** `2026-09-14-epic-03-booking-and-payment`
**Skill:** `om-auto-create-pr-loop`
**Branch:** `feat/epic-03-booking-and-payment`
**Base:** `master`
**Source spec:** `.ai/specs/2026-09-14-booking-and-payment.md`
**Subject issues:** #9 (epic) — #20, #21, #22, #23, #24, #25, #34

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed — per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Add the mentor listing card component | inline | done | 219290a |
| 1 | 1.1-review-fix | Drop the undefined listing-card class | inline | done | a2b5552 |
| 1 | 1.2 | List published bookable mentors by tag | inline | done | 8c259dc |
| 1 | 1.3 | Serve the public mentor list route | inline | done | 55335d3 |
| 1 | 1.4 | Render the public mentor list page | inline | done | f5f12eb |
| 1 | 1.4-review-fix | Count one mentor as one mentor | inline | done | edc15ed |
| 2 | 2.1 | Add the Booking entity and migration | inline | done | c5fb678 |
| 2 | 2.2 | Validate the booking request body | inline | done | 950d846 |
| 2 | 2.3 | Reserve a slot under a database lock | inline | done | c6f1d53 |
| 2 | 2.4 | Serve the booking creation route | inline | done | a0bab57 |
| 2 | 2.5 | Add the text-session notice component | inline | done | 15767cf |
| 2 | 2.6 | Let a mentee pick a slot and a length | inline | done | 5739ee3 |
| 2 | 2.6-review-fix | Defer the viewer timezone switch | inline | done | 48cbfcd |
| 2 | 2.1-review-fix | Clear reservations before times in the mentor fixture | inline | done | 26776ba |
| 3 | 3.1 | Define the payment gateway port and mock | inline | done | 9331e40 |
| 3 | 3.2 | Record payments and processed webhook events | inline | done | b602b5f |
| 3 | 3.3 | Select the Stripe gateway from configuration | inline | done | 716550e |
| 3 | 3.4 | Open a Checkout session for a pending booking | inline | done | a94bee5 |
| 3 | 3.5 | Confirm a booking exactly once from the webhook | inline | done | d7d6d33 |
| 3 | 3.6 | Expire a lapsed booking hold | inline | done | 077f595 |
| 3 | 3.7 | Serve the booking checkout route | inline | done | 06530ed |
| 3 | 3.8 | Serve the payment webhook route | inline | done | d7ed4e9 |
| 3 | 3.9 | Take the mentee through checkout and back | inline | done | e9387c9 |
| 4 | 4.1 | Add the Notification entity and migration | inline | done | 3b1eca2 |
| 4 | 4.2 | Tell both parties about a confirmed booking | inline | done | 37a5b53 |
| 4 | 4.3 | List a caller's own bookings | inline | done | d21090f |
| 4 | 4.4 | Serve the role-scoped bookings list route | inline | done | b4fc38d |
| 4 | 4.5 | Serve the notifications routes | inline | done | dd6150c |
| 4 | 4.6 | Show a mentee their sessions | inline | done | 20dd9e9 |
| 4 | 4.7 | Show a mentor their sessions | inline | done | 20dd9e9 |
| 4 | 4.8 | Surface unread notifications on each role home | inline | done | 999a37a |
| 4 | 4.8-review-fix | Read the notification time out | inline | done | 62b0e38 |
| 4 | 4.6-review-fix | Draw an unpaid hold as waiting, not ended | inline | done | 2a8f1a0 |
| 5 | 5.1 | Add the cancellation columns | inline | done | 3ebdb22 |
| 5 | 5.2 | Cancel a booking and refund inside the window | inline | done | 452406f |
| 5 | 5.3 | Settle a refund from the webhook | inline | done | 4d1fef2 |
| 5 | 5.4 | Serve the booking cancellation route | inline | done | d576da1 |
| 5 | 5.5 | Confirm a cancellation and its refund outcome | inline | done | 0e5f966 |
| 5 | 5.5-review-fix | Say the consequence once, not twice | inline | done | f5f0795 |
| 6 | 6.1 | Make the platform fee configurable | inline | done | pending |
| 6 | 6.2 | Add the fee snapshot, payout and Connect columns | inline | done | pending |
| 6 | 6.3 | Snapshot the fee split at confirmation | inline | done | pending |
| 6 | 6.4 | Add the Connect transfer to the payment gateway | inline | done | pending |
| 6 | 6.5 | Pay out or hold a completed session | inline | todo | — |
| 6 | 6.6 | Let the operator run payouts | inline | todo | — |
| 6 | 6.7 | Show a mentor their payouts | inline | todo | — |
| 7 | 7.1 | Report paid sessions and booking-to-start | inline | todo | — |
| 7 | 7.2 | Prove discovery and reservation in the browser | inline | todo | — |
| 7 | 7.3 | Prove payment confirmation and idempotency | inline | todo | — |
| 7 | 7.4 | Prove session-list scoping and notification | inline | todo | — |
| 7 | 7.5 | Prove cancellation on both sides of the window | inline | todo | — |
| 7 | 7.6 | Prove the payout hold and transfer | inline | todo | — |
| 7 | 7.7 | Record the contract, configuration and run | inline | todo | — |

## Goal

Ship epic #9 end to end: a mentee finds a bookable mentor, reserves a slot at least two
hours ahead at a 25- or 50-minute length, pays through Stripe Checkout, both parties are
told and see the session, the mentee can cancel under the 24-hour rule, and DevMentor's
20% is split off with the mentor's share transferred through Connect.

## Scope

Three new concept folders (`bookings`, `payments`, `notifications`) across `db`, `core` and
`app`; two new design-system components (`MentorDirectory`, `SessionIsTextNotice`) with
Storybook stories; the existing prototype components wired to real data; five migrations;
three new environment variables. Full detail: `.ai/specs/2026-09-14-booking-and-payment.md`.

## Non-goals

The spec's Non-goals section governs. In short: no search or ranking, no ratings, no text
session (E04), no Connect onboarding flow (E02-S05 — only the two columns a payout decision
reads), no operator settings screen (E05-S02), no mentor-initiated cancellation, no
scheduler, no page-visit recording.

## Risks

- **Money paths are `risk-high`.** `SDLC.md` requires a second reviewer and manual QA on
  E03-S03, E03-S05 and E03-S06; self-QA is not accepted. This run produces evidence, not
  a QA sign-off.
- **The 100% per-file unit-coverage gate applies to every new file.** Each Step adds its
  files to `coverage.include` in `vitest.config.mts` in the same commit; a Step that adds a
  file without covering every branch fails the checkpoint rather than the final gate.
- **Concurrency on one slot is the correctness crux.** It is proven by a partial unique
  index plus a locked transaction, and by an integration scenario firing two concurrent
  requests — not by a unit test alone.
- **Stripe is not contactable from this run.** Every scenario runs against
  `MockPaymentGateway`; the Stripe adapter is covered by unit tests against a stubbed SDK
  surface, and a real end-to-end Stripe pass remains owed to manual QA.
- `Booking` gains columns in four separate Steps (2.1, 3.2, 5.1, 6.2) so each story's
  migration is separately revertable. That is deliberate; it is not migration churn.

## External References

None. No `--skill-url` was passed.

## Implementation Plan

Every Step is one commit and adds its own production files to `coverage.include` in
`vitest.config.mts`. "Tests" below means unit tests at 100% statements/branches/functions/
lines for the files the Step adds or changes.

### Phase 1 — Mentor discovery (E03-S01, #20)

**1.1 Add the mentor listing card component**
- The design system already ships the list *shell*: `MentorDirectory` in
  `components/mentors/MentorProfileCard.tsx` (stack filter, result count, empty slot), whose
  Storybook story names #20 as its consumer. What is missing is the card the public list
  puts inside it — `MentorProfileCard` is the mentor's own profile card and carries a
  draft/published status chip and no price.
- `packages/ui/src/components/mentors/MentorListingCard.tsx`: composes the existing
  `MentorIdentity` and `TechnologyChips`, shows both session prices as separate neutral
  `Badge` fact chips (never dot-separated), the next available time as a `<time>`, and a
  link to the mentor page. No status chip, no rating, no score, no featured treatment.
- Stories: populated, no upcoming time, long content. Export from `packages/ui/src/index.ts`.
  Tests at 100%.

**1.1-review-fix Drop the undefined listing-card class**
- `MentorListingCard` carried `dm-mentor-listing` alongside `dm-product-panel`, and no
  stylesheet defines it. A class that matches no rule reads like styling that exists.

**1.2 List published bookable mentors by tag**
- `MentorProfileService.listPublished({ tag })`: published, both prices set, at least one
  active slot with `startsAt > now`; optional tag filter against `StackTags`; ordered by
  `lastPublishedAvailabilityAt` descending, then `id` for a stable tie-break.
- Returns a `MentorListingDto` carrying slug, headline, stack tags, both prices and the
  next slot start.
- Tests: excluded without a future slot, excluded without either price, excluded when
  unpublished, tag filter, ordering, tie-break.

**1.3 Serve the public mentor list route**
- `packages/app/src/app/api/mentors/route.ts`: `GET`, public, `apiHandler`,
  `force-dynamic`. `?tag=` validated against `StackTags`; anything else is a 422
  `validation_error`.
- Tests: no tag, valid tag, invalid tag.

**1.4 Render the public mentor list page**
- `packages/app/src/app/mentors/page.tsx`: public Tailwind surface, `force-dynamic`, reads
  the service through `withCookieScope`, renders `MentorDirectory` with tag links
  (`/mentors?tag=React`).
- Landing page links to it.
- Tests: page invocation with and without a tag; the landing link.

**1.4-review-fix Count one mentor as one mentor**
- The checkpoint-1 screenshot of the live page reads "1 mentors available". `MentorDirectory`
  hard-coded the plural; the count is now singular at one.

### Phase 2 — Reserving a slot (E03-S02, #21)

**2.1 Add the Booking entity and migration**
- `packages/db/src/entities/bookings/booking.entity.ts`: `slot` many-to-one, `mentee`
  many-to-one `User`, `mentorProfile` many-to-one, `lengthMinutes`, `priceCents`,
  `currency`, `status` (`pending` | `confirmed` | `cancelled` | `expired`), `startsAt`,
  `bookedAt` nullable, `expiresAt` nullable.
- Partial unique `bookings_active_slot_unique` on `slot` where status is `pending` or
  `confirmed`; check constraints for a positive price and a 25/50 length; index on
  `(mentee, startsAt)` and `(mentorProfile, startsAt)`.
- Register in `packages/db/src/entities/index.ts`; generate the migration; extend the
  complete-migration test.

**2.2 Validate the booking request body**
- `packages/core/src/validators/bookings/booking-create.schema.ts`: `slotId` uuid,
  `lengthMinutes` 25 or 50. Exported from `core`. Tests for each refusal.

**2.3 Reserve a slot under a database lock**
- `packages/core/src/services/bookings/booking.service.ts#start(input)`: mentee session
  required; inside `em.transactional` with the slot row locked — slot exists and is not
  removed, `startsAt - now >= 120 minutes` (D22), the mentor is offer-ready with a price for
  the chosen length, a lapsed pending booking on the slot is marked `expired` first, an
  active booking is a `ConflictError`. Price is read from the mentor's stored value, never
  from the client. Creates `pending` with `expiresAt = now + 30 min`.
- Register `bookingService` in `cradle.ts` and `container.ts`.
- Tests: lead time boundary, removed slot, missing slot, unbookable mentor, missing price
  for the length, lapsed pending superseded, live pending refused, confirmed refused,
  unique-violation mapped to 409, role and session guards.

**2.4 Serve the booking creation route**
- `packages/app/src/app/api/bookings/route.ts`: `POST`, `apiHandler`, `requireSession`,
  `requireRole(session, 'mentee')`, body parsed by the schema, returns the booking DTO 201.
- Tests: success, unauthenticated, wrong role, invalid body.

**2.5 Add the text-session notice component**
- `packages/ui/src/components/sessions/SessionIsTextNotice.tsx`: the single component
  stating sessions are text and that DevMentor promises nothing about how soon an answer
  arrives (R03, R14). Optional `tone` for inline vs callout placement.
- Export, stories, tests.

**2.6 Let a mentee pick a slot and a length**
- Colocated client component under `packages/app/src/app/m/[slug]/`: `AvailabilityPicker`
  for the slots (slots inside two hours disabled with the reason), `DurationSelector` for
  25/50 at the mentor's price, `BookingSummary` for the selection, `SessionIsTextNotice`
  on the screen.
- Signed-out: the action navigates to `/sign-in?returnTo=/m/<slug>?slot=<id>`; the page
  pre-selects `?slot=` on return.
- Wire it into `packages/app/src/app/m/[slug]/page.tsx`.
- Tests: both render paths, disabled reasons, sign-in redirect target, pre-selection,
  submit calling `apiCall`.

**2.1-review-fix Clear reservations before times in the mentor fixture**
- `bookings_slot_id_foreign` restricts, so the shared integration fixture's
  `nativeDelete(Slot, …)` is refused once a slot has a booking. All three reset paths in
  `tests/integration/fixtures/mentor.ts` now clear reservations first.

**2.6-review-fix Defer the viewer timezone switch**
- `react-hooks/set-state-in-effect` refuses a `setState` called synchronously in an effect
  body. The switch from UTC to the viewer's zone is now deferred through `queueMicrotask`,
  exactly as `LocalTime` already does it.

### Phase 3 — Paying (E03-S03 + E03-S03-T01, #22, #34)

**3.1 Define the payment gateway port and mock**
- `packages/core/src/services/payments/payment-gateway.port.ts`: `createCheckoutSession`,
  `parseWebhookEvent`, `refund` (types only — `transfer` arrives in 6.4).
- `adapters/mock-payment-gateway.ts`: in-memory sessions, deterministic ids,
  `simulateCheckoutCompleted(sessionId, amountCents)`, `simulateRefunded(...)`, and a
  signature scheme good enough to make a bad-signature test real.
- Export the port (not the adapters) from `core`. Tests for both.

**3.2 Record payments and processed webhook events**
- Booking gains `paidAt`, `stripeCheckoutSessionId` (unique, nullable),
  `stripePaymentIntentId` nullable, `amountPaidCents` nullable, `paymentIssue` nullable.
- `packages/db/src/entities/payments/processed-webhook-event.entity.ts`: `eventId` unique,
  `type`, `receivedAt`. Migration; complete-migration test updated.

**3.3 Select the Stripe gateway from configuration**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` added to the zod env schema (optional).
- `adapters/stripe-payment-gateway.ts`: the pinned `stripe` SDK behind the port, every
  Stripe error mapped to a typed `AppError`, fail-closed when a key is missing.
- `container.ts` registers `paymentGateway` — Stripe when `STRIPE_SECRET_KEY` is present,
  the mock otherwise, with a boot warning on the mock.
- Tests: both selection branches, each adapter method, error mapping, missing key.

**3.4 Open a Checkout session for a pending booking**
- `packages/core/src/services/payments/payment.service.ts#startCheckout(bookingId)`:
  ownership asserted, booking must be `pending` and unexpired, calls the gateway with the
  booking's own price and the hold's expiry, stores `stripeCheckoutSessionId`, returns the
  URL.
- Tests: success, not owner, not pending, expired hold, gateway failure leaves the booking
  pending.

**3.5 Confirm a booking exactly once from the webhook**
- `payment.service.ts#confirmFromWebhook(event)` inside `em.transactional`: insert the
  processed-event row first (duplicate ends as a no-op), find the booking by Checkout
  session id, return early when already confirmed, refuse and flag when `amountTotal`
  differs from `priceCents`, otherwise set `confirmed`, `bookedAt`, `paidAt`,
  `amountPaidCents`, `stripePaymentIntentId`, and emit `bookings.booking.confirmed`.
- `bookings.booking.confirmed` added to the event map with a logging subscriber.
- Tests: first delivery, duplicate delivery, unknown session, already confirmed, amount
  mismatch, cancelled booking.

**3.6 Expire a lapsed booking hold**
- `payment.service.ts#expirePending(now)`: marks every `pending` booking past `expiresAt`
  as `expired`, freeing its slot; returns the count.
- Tests: expires the lapsed, leaves the live and the confirmed alone.

**3.7 Serve the booking checkout route**
- `packages/app/src/app/api/bookings/[id]/checkout/route.ts`: `POST`, mentee only, returns
  `{ url }`. Tests: success, guards, unknown booking.

**3.8 Serve the payment webhook route**
- `packages/app/src/app/api/payments/webhook/route.ts`: `POST`, `force-dynamic`, raw body,
  `apiHandler(logic, { csrf: false })` — the documented single exception — signature
  verified through the port, 400 on a bad signature, `checkout.session.completed` dispatched
  to `confirmFromWebhook`, unknown types acknowledged and logged, bare 2xx to Stripe rather
  than the envelope.
- Tests: good signature, bad signature, unknown type, handler failure.

**3.9 Take the mentee through checkout and back**
- The booking panel calls the checkout route and redirects to the returned URL;
  `success_url` is `/sessions?booked=<id>` and `cancel_url` the mentor page.
- `PaymentStatus` renders `redirecting` / `pending` / `failed` / `slot-taken` / `expired`
  from the real outcome.
- Tests for each rendered state and the redirect.

### Phase 4 — Both parties know (E03-S04, #23)

**4.1 Add the Notification entity and migration**
- `packages/db/src/entities/notifications/notification.entity.ts`: `user`, `kind`,
  `booking` nullable, `readAt` nullable, index on `(user, readAt)`. Migration;
  complete-migration test updated.

**4.2 Tell both parties about a confirmed booking**
- `packages/core/src/services/notifications/notification.service.ts#onBookingConfirmed`:
  loads the booking with both parties, writes one `Notification` each, sends one email each
  through the `Mailer` port with start, length and the counterpart's name; failures are
  logged, never thrown (the row is the durable record).
- Subscribed to `bookings.booking.confirmed` in `container.ts#build`.
- Tests: two rows and two mails, mail failure swallowed, unknown booking, unconfirmed
  booking notifies nobody.

**4.3 List a caller's own bookings**
- `booking.service.ts#listForMentee()` and `#listForMentor()`: ordered by `startsAt`, each
  DTO carrying start, length, counterpart display name, status and refund state. No user id
  ever comes from the client.
- Tests: scoping (a second mentor's booking absent), ordering, upcoming/past split, empty.

**4.4 Serve the role-scoped bookings list route**
- `GET` added to `packages/app/src/app/api/bookings/route.ts`: `mentee` → `listForMentee`,
  `mentor` → `listForMentor`, a session holding both gets the mentee view with an explicit
  `?as=mentor` switch. Tests for each branch and the unauthenticated refusal.

**4.5 Serve the notifications routes**
- `packages/app/src/app/api/notifications/route.ts`: `GET` mine, `POST` mark read (by id,
  ownership asserted). Tests: list, mark read, not owner, unknown id.

**4.6 Show a mentee their sessions**
- `packages/app/src/app/(mentee)/sessions/page.tsx` + client: `SessionCard` per booking,
  upcoming and past sections, `SessionIsTextNotice`, and the `?booked=<id>` confirmation
  banner after Checkout. Nav entry added.
- Tests: authorized render, redirect when signed out, banner, empty state.

**4.7 Show a mentor their sessions**
- `packages/app/src/app/(mentor)/mentor/sessions/page.tsx` + client, same components, mentor
  scoping, nav entry. Tests: authorized render, redirect, empty state.

**4.8 Surface unread notifications on each role home**
- `NotificationItem` rendered on the mentee home and the mentor home with a mark-as-read
  action. Tests: unread and read states, mark-read call.

**4.6-review-fix Draw an unpaid hold as waiting, not ended**
- The checkpoint-5 screenshot showed a reserved-but-unpaid session under "Upcoming" with an
  "Ended" chip, which contradicts itself. `SessionCard` gains a `pending` state
  ("Waiting for payment", warning tone) — the design system drew sessions before payments
  existed, and a hold is a state the product now has.

**4.8-review-fix Read the notification time out**
- The checkpoint-5 screenshot showed a notification stamped `2026-09-14T08:21:15.889Z`. The
  ISO instant is the `dateTime` attribute's job, not a thing anybody reads; the visible
  label is now formatted in the viewer's zone.

### Phase 5 — Cancellation (E03-S05, #24)

**5.1 Add the cancellation columns**
- Booking gains `cancelledAt`, `refundStatus` (`none` | `pending` | `refunded` | `failed`),
  `stripeRefundId`, `refundedAmountCents`. Migration; complete-migration test updated.

**5.2 Cancel a booking and refund inside the window**
- `booking.service.ts#cancelByMentee(bookingId)`: ownership; a started session is a
  `ConflictError` naming the quality-dispute path; `free = startsAt - now >= 24 h`; inside
  the transaction set `cancelled`, `cancelledAt`, `refundStatus`; after commit, when free,
  refund through the gateway with the booking id as the idempotency key and record the
  result (`refunded` or `failed`, logged); emit `bookings.booking.cancelled`.
- Event added to the map; `NotificationService` tells the mentor.
- Tests: exactly-24-hours boundary on both sides, refund failure leaves `failed` and the
  booking cancelled, started session refused, not owner, already cancelled, pending booking.

**5.3 Settle a refund from the webhook**
- `charge.refunded` branch in `confirmFromWebhook`'s dispatcher marks the booking
  `refunded` idempotently through the same processed-event record.
- Tests: first delivery, duplicate, unknown charge.

**5.4 Serve the booking cancellation route**
- `packages/app/src/app/api/bookings/[id]/cancel/route.ts`: `POST`, mentee only; the
  response says whether a refund was made. Tests: both outcomes and the guards.

**5.5 Confirm a cancellation and its refund outcome**
- `CancellationSummary` in a confirmation dialog on the mentee sessions screen stating the
  rule and the outcome before the mentee confirms (R09); the mentor screen shows
  `cancelled` with its refund state.
- Tests: both copy variants, confirm and dismiss, mentor-side rendering.

**5.5-review-fix Say the consequence once, not twice**
- The checkpoint-6 screenshot showed the same sentence as the dialog's description and again
  inside `CancellationSummary`'s callout. The summary now carries the *rule* the amounts came
  from; the description keeps what happens to this booking.

### Phase 6 — Fee split and payouts (E03-S06, #25)

**6.1 Make the platform fee configurable**
- `PLATFORM_FEE_PERCENT` in the zod env schema, default 20, integer 0–100;
  `PlatformSettingsService.get().feePercent` and a `splitFor(priceCents)` helper returning
  `{ platformFeeCents, mentorShareCents }` that always sums to the price.
- Tests: default, override, out-of-range refusal, rounding at both ends.

**6.2 Add the fee snapshot, payout and Connect columns**
- Booking gains `feePercentApplied`, `platformFeeCents`, `mentorShareCents` (all nullable
  until confirmation). `MentorProfile` gains `stripeConnectAccountId` and `payoutsEnabled`
  (default false) — the E02-S05 surface a payout decision reads, nothing more.
- `packages/db/src/entities/payments/payout.entity.ts`: `booking` unique, `mentorProfile`,
  `amountCents`, `status` (`held` | `transferred` | `failed`), `stripeTransferId`,
  `heldReason`. Migration; complete-migration test updated.

**6.3 Snapshot the fee split at confirmation**
- `confirmFromWebhook` writes `feePercentApplied` and the two amounts from the settings in
  force at that moment.
- Tests: the split is recorded, a later fee change leaves an earlier booking untouched.

**6.4 Add the Connect transfer to the payment gateway**
- `transfer({ amountCents, currency, destinationAccountId, idempotencyKey, transferGroup })`
  on the port, implemented by both adapters (the mock records calls and can fail on demand).
- Tests: both adapters, idempotency-key reuse, failure mapping.

**6.5 Pay out or hold a completed session**
- `packages/core/src/services/payments/payout.service.ts#runDue(now)`: confirmed,
  uncancelled, unrefunded bookings whose session has ended and that have no payout;
  `payoutsEnabled` → transfer with the payout id as the idempotency key → `transferred`;
  otherwise `held` with `connect_onboarding_incomplete` and a notification to the mentor.
  `listForMentor()` for the payouts page.
- Tests: transferred, held, refunded excluded, cancelled excluded, not-yet-ended excluded,
  already-paid excluded, transfer failure → `failed` and retried on the next run.

**6.6 Let the operator run payouts**
- `packages/app/src/app/api/operator/payouts/run/route.ts`: `POST`, operator only, logged
  (R18); a "Run payouts" action on the admin dashboard; `scripts/payouts-run.ts` plus the
  `payouts:run` npm script for the founders.
- Tests: route guards, the summary it returns, the script's argument handling.

**6.7 Show a mentor their payouts**
- `packages/app/src/app/(mentor)/mentor/payouts/page.tsx`: `PayoutStatus` per session with
  gross, fee and share, plus the held explanation; nav entry.
- Tests: each status, the empty state, the redirect when signed out.

### Phase 7 — Reporting, integration proof and records

**7.1 Report paid sessions and booking-to-start**
- `booking.service.ts#paidSessionsPerWeek(since)` and `#medianBookingToStart(since)`,
  operator only, surfaced on the admin dashboard with `MetricSummary`.
- Tests: weekly grouping, median on odd and even counts, empty range, role guard.

**7.2 Prove discovery and reservation in the browser**
- `tests/integration/mentor-booking.integration.test.ts`: the list shows a bookable mentor
  and carries no `searchbox` role; a signed-out pick returns to the same slot after sign-in;
  two concurrent reservations on one slot yield one success and one refusal.

**7.3 Prove payment confirmation and idempotency**
- `tests/integration/payment.integration.test.ts`: reserve, simulate the Checkout webhook,
  see the confirmed session on both sides; deliver the same event twice and see one booking
  and one charge; abandon a Checkout and see the slot free again.

**7.4 Prove session-list scoping and notification**
- `tests/integration/sessions-list.integration.test.ts`: mentor A's list does not contain
  mentor B's booking; both parties hold a notification after confirmation.

**7.5 Prove cancellation on both sides of the window**
- `tests/integration/cancellation.integration.test.ts`: a cancellation more than 24 hours
  out refunds and frees the slot; one inside the window frees the slot without a refund and
  said so first.

**7.6 Prove the payout hold and transfer**
- `tests/integration/payout.integration.test.ts`: a completed session with Connect enabled
  transfers; without it, holds and tells the mentor.

**7.7 Record the contract, configuration and run**
- `BACKWARD_COMPATIBILITY.md`: the webhook's non-enveloped exception, the new tables and
  columns, the additive port methods, the three environment variables, the new events.
- `.env.example`, `README.md`, the CI workflow and `tests/integration/environment.ts` carry
  the new variables.
- `.ai/runs/2026-09-14-epic-03-booking-and-payment/` run log finalized; the spec moves to
  `.ai/specs/implemented/`; `.ai/lessons.md` gains anything learned.

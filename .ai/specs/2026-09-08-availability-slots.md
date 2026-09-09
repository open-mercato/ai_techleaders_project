# DevMentor — E02-S03: Publishing slots

Date: 2026-09-08
Status: active
Issue: [#17](https://github.com/open-mercato/ai_techleaders_project/issues/17) (epic #8)
Depends on: E02-S01 (#15), E02-S02 (#16); E01 Slices 1, 2 and 4
Design authority for architecture, data model and the occupancy rule:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 3, and the "occupancy rule" section)

A **thin story spec** — behaviour, screens and acceptance criteria only.

## 📝 TLDR

A mentor publishes individual start times, sees them on their page and removes them. This slice owns
availability only; E03 owns booking occupancy and the point at which a slot can no longer be removed.

## 📝 Problem Statement

D22 decides that mentors publish slots and that a slot remains eligible until the booking attempt is
later than two hours before its start. Nothing in the repository stores availability; `AGENTS.md`
names an `availability` concept that does not exist.

**The story as filed exposed an E03 requirement but does not implement it.** A slot is a bare start
instant, while #21 lets the mentee choose 25 or 50 minutes at booking time. `viableLengths`, interval
occupancy and double-booking prevention therefore belong to E03, where real `Booking` intervals exist.
This slice deliberately avoids a partial occupancy implementation that would have to be replaced.

## 📝 Scope

**In:** the `Slot` record; publish, list and remove; the two-hour lead evaluated against the service's
clock at read time; maintenance of the mentor's most-recent-published-availability key (R13); future
slots on the public page.

**Out:** booking and occupancy, including `viableLengths` and booked-slot removal (#21, #22);
cancellation (#24); recurring availability, buffers, minimum notice per mentor and daily caps — none
of which any decision asks for (see the epic's market-leader section for why each was skipped).

## 📝 UI/UX

**`/mentor/slots`** — app surface. A `DataTable` of future slots and a `CrudForm` with the `datetime`
field for a new start time. Past slots sit behind a "show past" toggle rather than filling the table.
There is no `booked` state before E03 introduces bookings.

Every instant renders through `LocalTime`. The form states the viewer's timezone explicitly next to the
field — a mentor publishing availability is the one user who must be certain which clock they are
using, and `<input type="datetime-local">` gives no indication of its own.

**`/m/[slug]`** shows future published slots. A slot is enabled through exactly two hours before its
start and disabled after that boundary with the reason, so a visitor understands the page is live.
Slice 4 adds price readiness; E03 adds the lengths still viable after occupancy is considered.

## ✅ Acceptance criteria

- Given a mentor, When they publish a start time, Then it appears as a slot on their page and the
  page's most-recent-published-availability updates for the list's order. (D22, R13)
- Given a published slot in this booking-agnostic slice, When its mentor removes it, Then it disappears
  from the page. E03 later narrows removal when an active booking exists.
- Given a slot that was removed, When the mentor republishes the same start time, Then it is accepted.
  (the partial unique index)
- Given a slot at 18:00 and the service clock at 16:00, When the public page renders, Then the slot is
  enabled; once the clock is later than 16:00, Then it is disabled with the reason. (R14)
- Given a client-supplied timestamp that is already past according to the service clock, When the
  mentor publishes it, Then the service refuses it even if the shape-level request schema accepted
  the timestamp.

## 📝 Requirements handed to E03

E03 adds an immutable `Booking.slotId`; `Slot` never gains a `bookingId`. All booking behavior,
including which states occupy time, belongs to the E03 booking/payment spec. That
spec must make overlapping active sessions impossible under concurrency, derive viable lengths and
decide when a referenced slot may be removed. R09 is a downstream requirement, not E02 behavior.

## 📝 Risks

`risk-high` — a schema migration (`SDLC.md:97`). `needs-qa`, second reviewer. Compatibility: a new
table with a partial unique index (§3, `up` and `down`); new routes reusing the existing
`409 conflict` code (§1, additive). `Slot` carries **no booking relation in any slice**: E03 adds the
immutable `Booking.slotId` foreign key and corresponding relation on `Booking`.

## 📝 Decisions in play

D22/R14, R13, R18. R09 is handed to E03 above.

## 📝 Open questions

- **Single start times or recurring hours** — resolved in the epic spec: single start times, the plain
  reading of D22. Recurrence needs an expansion engine and a DST policy and is a later story if D22 is
  superseded.
- **How the mentor learns a slot was booked** — #23 owns the notification. Non-blocking.

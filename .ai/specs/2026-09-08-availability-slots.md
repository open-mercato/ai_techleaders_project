# DevMentor — E02-S03: Publishing slots

Date: 2026-09-08
Status: active
Issue: [#17](https://github.com/open-mercato/ai_techleaders_project/issues/17) (epic #8)
Depends on: E02-S01 (#15), E02-S02 (#16); E01 Slices 1, 2 and 4
Design authority for architecture, data model and the occupancy rule:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 3, and the "occupancy rule" section)

A **thin story spec** — behaviour, screens and acceptance criteria only.

## 📝 TLDR

A mentor publishes individual start times, sees them on their page, removes the ones nobody took, and
cannot remove one that is booked. A slot stops being offered when a booking would overlap it.

## 📝 Problem Statement

D22 decides that mentors publish slots and that a slot is bookable when it starts at least two hours
after the booking. Nothing in the repository stores availability; `AGENTS.md` names an `availability`
concept that does not exist.

**The story as filed had a hole the epic spec fixes.** A slot is a bare start instant, but #21 lets the
*mentee* choose 25 or 50 minutes at booking time — so slots at 14:00 and 14:30 could produce a
double-booked mentor. The rule is in the epic spec: `viableLengths` filters the offer at read time, and
E03-S02's booking transaction re-checks it while serialising on the **mentor** row, not the slot row,
backed by an exclusion constraint on `bookings`. This story ships the pure function and its full
boundary matrix; E03 supplies the real intervals and the constraint.

## 📝 Scope

**In:** the `Slot` record; publish, list and remove; the two-hour lead evaluated against `now` at read
time; the occupancy rule; maintenance of the mentor's most-recent-published-availability key (R13);
slots on the public page.

**Out:** booking the slot (#21, #22); cancellation (#24); recurring availability, buffers, minimum
notice per mentor and daily caps — none of which any decision asks for (see the epic's market-leader
section for why each was skipped).

## 📝 UI/UX

**`/mentor/slots`** — app surface. A `DataTable` of future slots with state (`open`, `booked`) and a
`CrudForm` with the `datetime` field for a new start time. Past slots sit behind a "show past" toggle
rather than filling the table.

Every instant renders through `LocalTime`. The form states the viewer's timezone explicitly next to the
field — a mentor publishing availability is the one user who must be certain which clock they are
using, and `<input type="datetime-local">` gives no indication of its own.

**`/m/[slug]`** shows bookable slots with the lengths still available on each. A slot inside the
two-hour lead is shown disabled with the reason rather than hidden, so a visitor understands the page
is live.

## ✅ Acceptance criteria

- Given a mentor, When they publish a start time, Then it appears as a slot on their page and the
  page's most-recent-published-availability updates for the list's order. (D22, R13)
- Given a published slot, When a mentee's payment confirms a booking on it, Then the slot is no longer
  offered. (D22)
- Given an unbooked slot, When the mentor removes it, Then it disappears from the page.
- Given a booked slot, When the mentor tries to remove it, Then the product refuses and points to
  cancellation. (R09, negative)
- Given a slot every length of which would overlap an existing booking, When the public page renders,
  Then that slot is not offered; and given a slot where only 25 minutes still fits, Then only 25
  minutes is offered. (the occupancy rule)
- Given a slot that was removed, When the mentor republishes the same start time, Then it is accepted.
  (the partial unique index)
- Given a slot starting in less than two hours, When the public page renders, Then it is shown disabled
  with the reason. (R14)

## 📝 Risks

`risk-high` — a schema migration (`SDLC.md:97`). `needs-qa`, second reviewer. Compatibility: a new
table with a partial unique index (§3, `up` and `down`); new routes reusing the existing
`409 conflict` code (§1, additive). `Slot` carries **no `booking` property** in this slice: E03-S03
adds the column, the foreign key and the property together, because a declared property with no
column breaks every read of the table.

## 📝 Decisions in play

D22/R14, R09, R13, R18.

## 📝 Open questions

- **Single start times or recurring hours** — resolved in the epic spec: single start times, the plain
  reading of D22. Recurrence needs an expansion engine and a DST policy and is a later story if D22 is
  superseded.
- **How the mentor learns a slot was booked** — #23 owns the notification. Non-blocking.

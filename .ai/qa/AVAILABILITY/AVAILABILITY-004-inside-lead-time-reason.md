# TC-AVAILABILITY-004: A slot inside the two-hour lead time shows why it can't be requested

**Implementation:** [`tests/integration/availability.integration.test.ts`](../../../tests/integration/availability.integration.test.ts), `describe('TC-AVAILABILITY-004 a slot inside the two-hour lead time')`

| Field | Value |
| --- | --- |
| Test ID | TC-AVAILABILITY-004 |
| Category | Availability / public presentation |
| Priority | Medium |
| Type | UI (agent-browser, signed out) plus the public API |
| Persona | Signed-out visitor |
| Spec | `.ai/specs/2026-09-08-availability-slots.md`, acceptance criterion "lead-time boundary and disabled reason". The inclusive boundary is covered at the service level by TC-AVAILABILITY-002; this scenario covers the rendered reason. |

## Prerequisites

Fixtures `seedPublishedMentorProfile` and `seedFutureMentorSlot(…, now + 1 h)`. Cleanup: `resetPublishedMentorProfile`, then close the browser session.

## Steps

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | A published mentor with one slot starting in one hour | `GET /api/mentors/<slug>` returns `slots: [{ id, startsAt, meetsLeadTime: false }]`. |
| When | A signed-out visitor opens `/m/<slug>` | The page shows `heading "Available times"` and the note "A session must be requested at least two hours before it starts." |
| Then | The time is listed with its reason | The `time` element's `datetime` equals the slot's `startsAt`, and `[role="status"]` reads `Unavailable because this time starts in less than two hours.` |

Screenshot: `test-results/integration/availability-inside-lead-time.png`.

## Edge cases and notes

"One hour ahead" stays inside the window for an hour, far longer than the test runs, so the result doesn't depend on the clock. The test asserts the reason text, not a countdown.

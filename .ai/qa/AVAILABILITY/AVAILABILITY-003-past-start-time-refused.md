# TC-AVAILABILITY-003: A start time that has passed is refused

**Implementation:** [`tests/integration/availability.integration.test.ts`](../../../tests/integration/availability.integration.test.ts), `describe('TC-AVAILABILITY-003 a start time that has passed')`

| Field | Value |
| --- | --- |
| Test ID | TC-AVAILABILITY-003 |
| Category | Availability / validation |
| Priority | Medium |
| Type | API, with database assertions |
| Persona | Signed-in mentor (`mock-mentor`) |
| Spec | `.ai/specs/2026-09-08-availability-slots.md`, acceptance criterion "past timestamp refused by the service" |

## Prerequisites

Fixture `seedPublishedMentorProfile` creates a published page with no slots and `lastPublishedAvailabilityAt = null`. Cleanup: `resetPublishedMentorProfile`.

## Steps

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | A published mentor with no slots | — |
| When | `POST /api/availability/slots` with `startsAt` set to one hour ago | `422 {"ok":false,"error":{"code":"validation_failed","message":"Choose a start time that has not passed.","fieldErrors":{"startsAt":["Choose a start time that has not passed."]}}}` |
| Then | Nothing is written | Zero `slots` rows for the profile. `lastPublishedAvailabilityAt` is still `null`. |
| Then | Nothing is public | `GET /api/mentors/<slug>` returns `slots: []`. |

## Edge cases and notes

The schema only checks the shape (`z.string().datetime()`). The time rule is `SlotService.publish` checking server time, so this path crosses the API and the service.

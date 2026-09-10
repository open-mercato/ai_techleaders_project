# Epic E02 Slice 3 — Availability slots

Date: 2026-09-10
Status: in-progress
Issue: #17
Epic: #8
Source spec: .ai/specs/2026-09-08-availability-slots.md
Architecture authority: .ai/specs/2026-09-08-mentors-become-bookable.md

## Tasks

> Authoritative status table. `Status` is `todo` or `done`. Each Step is exactly one commit.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Add Slot persistence and the reversible availability migration | dispatch:standard | done | a8a7e8b |
| 1 | 1.2 | Add slot validation, service behavior and container wiring | dispatch:capable | done | a5e2d85 |
| 1 | 1.3 | Add owner-scoped availability routes | dispatch:standard | todo | — |
| 2 | 2.1 | Add the datetime CrudForm field and local-to-UTC conversion | dispatch:standard | todo | — |
| 2 | 2.2 | Add mentor slot management and public availability presentation | dispatch:capable | todo | — |
| 3 | 3.1 | Add availability integration coverage and browser proof | dispatch:capable | todo | — |

## Goal

Let mentors publish and remove individual future start times, while signed-out visitors see those
times with an authoritative two-hour lead-time state.

## Scope

- Add `Slot` persistence, its partial active-slot uniqueness rule and the mentor profile ordering key.
- Add owner-scoped validation, service, routes and the mentor slots page.
- Convert browser-local `datetime-local` values to UTC before the API call and render instants through `LocalTime`.
- Extend the public mentor projection and page with future availability and the two-hour boundary.
- Prove publish, remove, republish, public visibility and lead-time behavior across unit and integration tests.

## Non-goals

- No booking relation, occupancy, booking-aware removal or viable-duration calculation; E03 owns them.
- No recurring availability, buffers, mentor-specific notice rules or capacity limits.
- No prices or payment behavior; Slice 4 and E03 own those concerns.

## Risks

- The additive schema and partial unique index must round-trip and preserve removed-slot republishing.
- Browser-local wall-clock conversion is timezone-sensitive and requires exact client tests plus browser evidence.
- This PR is intentionally stacked on Slice 2 PR #44 because Slice 3 consumes its profile/public-page contracts.

## External References

- None.

## Implementation Plan

### Phase 1: Persistence and server contracts

1.1 Add the `Slot` entity, registration, `MentorProfile.lastPublishedAvailabilityAt`, reversible migration,
tracked snapshot and complete entity/migration tests. The active uniqueness constraint is partial on
`(mentor_profile_id, starts_at) where removed_at is null`; no booking relation exists.

1.2 Add the ISO-instant request schema and `SlotService` owner list/publish/remove behavior. Publish uses
the injected server clock to reject past starts and updates the ordering key in the same transaction;
remove is ownership-scoped and soft-deletes; public reads return future slots with `meetsLeadTime` using
the exact two-hour boundary. Register the service and cover success, refusal, ownership and race branches.

1.3 Add mentor-authorized collection `GET`/`POST` and item `DELETE` routes through the shared owned-route
callbacks, including parameter, validation, authorization, conflict and envelope tests.

### Phase 2: Forms and screens

2.1 Extend `CrudForm` with a `datetime` field that renders `datetime-local`, states the active timezone,
converts a valid local wall-clock value to an ISO UTC instant before submission, and retains invalid values
for schema feedback. Cover DST-independent conversion seams and every new branch.

2.2 Add `/mentor/slots`, its navigation entry and shared slot presentation. The mentor surface uses
`DataTable`, `CrudForm`, feedback primitives and `LocalTime`; `/m/[slug]` shows future slots and marks the
exact two-hour boundary enabled, then explains why later times are disabled. Preserve the public DTO allowlist.

### Phase 3: Cross-boundary proof

3.1 Add owned integration fixtures and scenarios for publish, public visibility, exact lead-time state,
remove and republish. Capture desktop and mobile browser evidence at the checkpoint.

## Decisions

- The active epic spec supersedes issue #17's stale booking relation: E02 slots never reference bookings.
- A start exactly two hours away meets the lead-time rule; only a later clock disables it.

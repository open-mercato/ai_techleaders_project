# Epic E02 Slice 3 — Availability slots

Date: 2026-09-10
Status: implementation-complete
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
| 1 | 1.3 | Add owner-scoped availability routes | dispatch:standard | done | 72b2c64 |
| 2 | 2.1 | Add the datetime CrudForm field and local-to-UTC conversion | dispatch:standard | done | 9400043 |
| 2 | 2.2 | Add mentor slot management and public availability presentation | dispatch:capable | done | c55138f |
| 3 | 3.1 | Add availability integration coverage and browser proof | dispatch:capable | done | 11141b9 |
| 3 | 3.2-gate-fix | Make the complete-schema integration check apply availability | inline | done | b0e1430 |
| 3 | 3.3-gate-fix | Wait for asynchronous server-error focus in CrudForm coverage | inline | done | eb22d0d |
| 3 | 3.4-gate-fix | Make the QA launcher stop stale same-worktree dev servers | inline | done | 1699bde |
| 3 | 3.5-review-fix | Make mentor-profile page tests independent of the caller environment | inline | done | 39fdf99 |
| 3 | 3.6-review-fix | Preserve and document exported compatibility while structurally mapping duplicate slots | inline | todo | — |
| 3 | 3.7-review-fix | Reject nonexistent and ambiguous local wall-clock times | inline | todo | — |
| 3 | 3.8-review-fix | Bound active slot publication and reads | inline | todo | — |
| 3 | 3.9-review-fix | Make browser integration prove the published slot and capture evidence | inline | todo | — |

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

3.2-gate-fix Fix the shared migration integration sequence so its complete-entity-model assertion first
applies every migration, including the newly added availability migration, and proves that migration is recorded.

3.3-gate-fix Stabilize the existing server-field-error focus assertion by waiting for the effect that moves
focus after React commits the asynchronous request result; retain the existing behavior assertion unchanged.

3.4-gate-fix Repair the generated QA launcher and teardown so force starts stop the recorded environment,
stale launchd jobs for this exact worktree are removed with their process groups, and a dead URL cannot be
published while an orphaned Next server still holds the worktree lock. Prove cold start and warm reuse.

3.5-review-fix Mock the configuration seam in the existing mentor-profile page unit test so the configured
gate remains deterministic when the caller legitimately supplies a non-default `APP_URL`.

3.6-review-fix Keep additive slot response typing source-compatible, give direct service construction a
safe empty-slot bridge, replace module-identity exception narrowing with an exact structural database error
check, and update the protected-contract inventory.

3.7-review-fix Refuse a browser-local datetime when it does not round-trip to the same wall clock or has a
second possible instant during an offset fold. Keep the entered value for field-level schema feedback and
cover both transition shapes through an environment-independent seam.

3.8-review-fix Serialize a per-mentor active-slot cap under the existing profile lock and place the same
explicit bound on owner/public reads, with boundary and refusal coverage.

3.9-review-fix Strengthen the integration scenario to assert the exact rendered slot time and standalone
status rather than a heading substring, prove the non-empty state, and capture its key browser screenshot.

## Decisions

- The active epic spec supersedes issue #17's stale booking relation: E02 slots never reference bookings.
- A start exactly two hours away meets the lead-time rule; only a later clock disables it.

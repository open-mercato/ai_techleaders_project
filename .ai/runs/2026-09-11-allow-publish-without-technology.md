# Execution plan — allow publishing a mentor page without a technology

Engine: om-auto-create-pr (steps: 4, --loop: no)

## Goal

Let a mentor publish their page with no technology selected, **on purpose**, so the
integration suite has a real regression to catch. The operator wants to see
`TC-MENTOR-PROFILE-001` (`.ai/qa/MENTOR-PROFILE/MENTOR-PROFILE-001-publish-requires-technology.md`,
`tests/integration/mentor-profile.integration.test.ts`) fail in CI.

## Scope

- `packages/core/src/services/mentors/readiness.ts` — drop the `stackTags` item from
  `mentorPagePublishable`. That one rule drives three behaviours: the publish refusal
  (`MentorProfileService.publish`), the re-check when a published page is edited
  (`MentorProfileService.update`), and the "Choose at least one technology." item in the
  profile editor's readiness list.
- `packages/app/src/app/(mentor)/mentor/mentor-onboarding-status.tsx` — remove the now-dead
  `stackTags` action entry, if nothing else reads it.
- Unit tests that pin the removed rule are updated so the unit gate stays green. Only the
  integration scenario is left to fail.

## Non-goals

- **No change under `tests/integration/`.** The integration test and its fixture stay exactly
  as merged in #50; their failure is the whole point.
- No change to the QA record `.ai/qa/MENTOR-PROFILE/MENTOR-PROFILE-001-*.md` or to the
  mentor-page spec.
- No change to the `max(4)` technology cap, the public page, or invitations.
- This PR is **not meant to be merged**. It is a deliberate regression used to test CI.

## Implementation Plan

### Phase 1: Remove the technology publish rule

1. Drop the `stackTags` readiness item from `mentorPagePublishable` and any consumer entry it
   leaves dead.
2. Update the unit tests that asserted the rule so they describe the new behaviour, keeping
   per-file 100% coverage.

### Phase 2: Verify

1. Run the configured validation gate (`typecheck`, `lint`, `test`, `build`) and the unit
   coverage gate.
2. Run `TC-MENTOR-PROFILE-001` locally, if Docker is available, and record that it fails for
   the expected reason.

## Risks

- **Intentional regression.** Merging this would let mentors publish pages with no
  technology, which the mentor-page spec requires. The PR is labelled `do-not-merge`.
- Removing the item also removes it from the readiness list, so the integration test may
  fail at its first "Given" assertion (readiness item marked Required) rather than at the
  publish click. Either failure proves the suite catches the regression; the run records
  which assertion fails.

## Outcome

- Validation gate on `bb5959f`: `npm run typecheck`, `npm run lint`, `npm run test:unit:coverage`
  (150 files, 1745 tests, per-file 100% coverage) and `npm run build` all pass.
- `npx vitest run --config vitest.integration.config.mts tests/integration/mentor-profile.integration.test.ts -t TC-MENTOR-PROFILE-001`
  **fails**, as intended:
  `AssertionError: expected '- generic\n  - link "Skip to content"…' to contain 'heading "Choose at least one technolo…'`.
  It fails at the first "Given" assertion, because the readiness list no longer shows the
  technology item, so the test never reaches the publish click. The suite catches the
  regression before any publish request is sent.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Remove the technology publish rule

- [x] 1.1 Drop the stackTags readiness item and dead consumer entries — bb5959f
- [x] 1.2 Update unit tests for the new behaviour — bb5959f

### Phase 2: Verify

- [x] 2.1 Run the validation and coverage gates — bb5959f
- [x] 2.2 Run TC-MENTOR-PROFILE-001 locally and record the failure — bb5959f

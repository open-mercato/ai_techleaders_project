# E02-S01 — Invitations and mentor role grant

Date: 2026-09-10
Status: complete
Issues: #15, #16
Epic: #8
Source doc: .ai/specs/2026-09-08-invitations.md
Architecture and implementation authority: Slice 1 of `.ai/specs/2026-09-08-mentors-become-bookable.md`

## Goal

Let an invited senior engineer accept a single-use invitation with the matching verified account,
gain the additive `mentor` role without losing existing roles or their session, and see the durable
two-week publication deadline on the mentor home.

## Scope

- Add the minimum E01 Slice 0 prerequisites absent from `origin/master`: the React test toolchain,
  live GitHub session and multi-role model, request-scoped authorization/CSRF, role homes, page guards
  and signed-in shell. Reuse the reviewed local implementation by copying commits into this branch;
  `feat/lesson-08` itself stays read-only.
- Add opaque invitation token support, the invitation persistence model and its reversible migration.
- Add the invitation lifecycle service, role/profile/deadline transaction, typed event and dependency
  injection wiring.
- Add public invitation lookup/acceptance and owner-scoped mentor onboarding API contracts.
- Compose the invitation and first mentor-home screens from the existing design-system components and
  authoritative E02 Storybook handoff.
- Add the by-hand `invite create|revoke|resend` operator command and documented configuration.
- Add mentor profile drafting, readiness validation, stable slugs, publication controls, the signed-out
  public page and the matching Storybook-backed editor preview from Slice 2.
- Cover every changed production file at 100% and add the cross-boundary browser integration scenario.

## Non-goals

- No mutation, push, retarget or PR creation on `feat/lesson-08` or any other pre-existing branch.
- No E01 email/password fallback, password reset or mail delivery; those are not runtime prerequisites
  for the GitHub-based invitation acceptance path and remain owned by E01 Slice 4.
- No operator UI, batch table or automated two-week report; #30 owns those capabilities.
- No real invitation email transport; the operator command prints the one-time link.
- No prices, slots, booking, ratings or payments; later E02/E03 stories own those capabilities.
- No open registration or any other path to acquire the mentor role.

## Implementation Plan

### Phase 0: Prerequisite and base integrity

0. Bring the missing E01 runtime prerequisites into this task branch as an explicit Slice 0 without
   changing their source branch: React testing, clock/config, auth/session/role persistence, GitHub
   identity, request scope, CSRF, route/page guards, role homes, navigation and integration harness.
   Keep the unfinished email/password work out. Confirm the tracked MikroORM snapshot is current and
   integration migrations disable snapshot writes.

### Phase 1: Token, persistence and configuration

1. Add opaque token minting/hashing primitives and complete unit coverage.
2. Add the `Invitation` entity, `MentorProfile.initialPublishDueAt`, entity registration and a reversible
   invitations migration with database constraints, the current tracked snapshot and migration tests.
3. Add invitation TTL and mentor publication-window configuration across both validated schemas,
   environment examples, CI, README and integration child-process forwarding.

### Phase 2: Invitation domain lifecycle

4. Implement and register `InvitationService` create/lookup/accept/revoke/resend with normalized
   beachhead tags, lock ordering, additive role grant, session-version behavior, profile/deadline
   idempotence, a typed acceptance event emitted only after commit, and exhaustive unit/concurrency
   coverage including rollback-without-event.

### Phase 3: API and user interface

5. Add `formatInstant` and `LocalTime` as covered surface-agnostic UI exports.
6. Pull the `ownedAction` primitive and its tests forward from Slice 2, then add covered dynamic
   invitation lookup/accept routes and the service-owned, mentor-authorized onboarding read. Include
   identical invalid-token responses, mismatch refusal, session-cookie re-issuance after acceptance,
   and regression coverage proving raw token path segments never enter unexpected-error logs.
7. Add covered `/invitation/[token]` and `/mentor` experiences using shared Card, Button,
   MentorOnboarding, AppShell and feedback primitives, with signed-out continuation, mismatch,
   retry, invalid and first-visit deadline states matching the E02 design handoff.

### Phase 4: Operator command and end-to-end proof

8. Add the covered `invite create|revoke|resend` operator command, npm script and README guidance,
   including token-free audit output and one-time link output only for successful create/resend.
9. Add the isolated invitations integration fixture/scenario for successful acceptance and retained
   session, invalid links and the absence of any open mentor-registration path.

## Risks

- This is the product's only self-service role grant. Persisted verified-email matching, single-use
  token state, transaction locks, additive role semantics and session re-issuance are security gates.
- The schema and configuration additions are compatibility surfaces; the migration must round-trip and
  every configured environment must carry the new defaults.
- The Storybook compositions are authoritative for hierarchy, copy, recovery and component reuse;
  final browser QA remains required before merge.

## Prerequisite gate

The initial gate blocked on 2026-09-10 before the plan commit. `origin/master` still contains the fail-closed E01
placeholder session and lacks the E01 Slice 1/2 contracts this story calls: verified email,
multi-role sessions, `sessionVersion`, `grantRole`, request-scoped session injection, central CSRF,
page guards and the auth routes. The work exists only on the unmerged `origin/feat/lesson-08`
branch, whose own implementation tracker is incomplete and has no PR.

The user then explicitly authorized implementing missing E01 work immediately, while forbidding any
mutation of `feat/lesson-08` or other existing branches. This run therefore copies only the completed
E01 prerequisite commits into `feat/invitations` as Slice 0 and ships one new PR. Before E02 coding,
resolve the spec sequencing mismatch where Slice 1 requires
`ownedAction` but `core/src/http/owned-route.ts` is assigned to Slice 2; the smallest compatible
choice is to pull the `ownedAction` primitive and its tests into Slice 1 without pulling the rest of
the mentor-page slice forward.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: Prerequisite and base integrity

- [x] 0.1 Copy the completed E01 React-testing and GitHub-session foundation into this branch without modifying its source branch. — temporary prerequisite PR #45 at `65ef2f7`
- [x] 0.2 Copy the completed E01 signed-in shell, role guards, navigation and integration assertions into this branch. — temporary prerequisite PR #45 at `65ef2f7`
- [x] 0.3 Verify the Slice 0 tree excludes unfinished email/password work and passes the full configured validation gate. — temporary prerequisite PR #45 at `65ef2f7`

### Phase 1: Token, persistence and configuration

- [x] 1.1 Add opaque token minting/hashing primitives and complete unit coverage. — `45d1ef9`
- [x] 1.2 Add the Invitation entity, MentorProfile deadline, reversible migration and database tests. — `45d1ef9`
- [x] 1.3 Add invitation TTL and mentor publication-window configuration across all required surfaces. — `45d1ef9`

### Phase 2: Invitation domain lifecycle

- [x] 2.1 Implement and register the complete invitation lifecycle with event and concurrency coverage. — `45d1ef9`, `346c5c5`

### Phase 3: API and user interface

- [x] 3.1 Add covered formatInstant and LocalTime shared UI exports. — `45d1ef9`
- [x] 3.2 Add invitation lookup/accept and mentor onboarding API routes with cookie re-issuance coverage. — `45d1ef9`
- [x] 3.3 Add the invitation and first mentor-home screens from the authoritative design system. — `45d1ef9`, `8cbeb9a`

### Phase 4: Operator command and end-to-end proof

- [x] 4.1 Add the covered operator invitation command, npm script and documentation. — `71061d0`
- [x] 4.2 Add the isolated invitation browser integration fixture and scenario. — `45d1ef9`, `346c5c5`

### Phase 5: Slice 2 mentor page

- [x] 5.1 Add profile persistence, readiness, stable collision-safe slugs and publish/unpublish services and routes. — `242cdc9`
- [x] 5.2 Add the mentor editor, shared preview/public-page component, signed-out `/m/<slug>` page and Storybook examples. — `8cbeb9a`, `242cdc9`
- [x] 5.3 Prove public DTO allowlisting, migration round trips and concurrent slug/publication transitions. — `242cdc9`

## Outcome

PR #44 contains only E02 implementation commits above temporary E01 prerequisite PR #45. The exact
heads passed Build, Lint, Unit tests and Integration tests in GitHub Actions. Local validation also
passed typecheck, production build, Storybook build/typecheck, prototype checks, 1,571 unit tests at
100% per-file coverage and 53 integration tests. Real-browser QA passed invitation acceptance,
single-use rejection, deadline onboarding, profile validation and recovery, save/preview,
publish/copy/unpublish/stable-republish, signed-out allowlisting and mobile layouts. Evidence and the
reusable QA environment are committed under `.ai/qa/` and `.ai/scripts/`.

Follow-up: after Pat's canonical E01 branch lands, rebase/retarget PR #44 away from disposable PR #45,
then close #45 without merging it. Independent review and QA approval remain external merge gates.

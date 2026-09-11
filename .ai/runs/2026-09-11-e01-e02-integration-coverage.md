# Run: E01 and E02 integration coverage gaps

Date: 2026-09-11
Skill: `om-integration-tests` (with the DevMentor extension in `.ai/skills/om-integration-tests/`)

## Requested
Read the Epic 01 and Epic 02 specs, find acceptance-criteria scenarios that no integration test
covers, and write integration tests and `.ai/qa` scenario docs for them.

## Specs examined
- E01: `2026-09-04-accounts-and-roles.md`, plus the observable parts of `2026-09-04-platform-primitives.md`.
- E02: `2026-09-08-mentors-become-bookable.md` and its stories `invitations`, `mentor-page`,
  `availability-slots` and `mentor-prices`.
- Left out: `stripe-connect-onboarding` (blocked, scoped to 1.1).

## What was done
1. Two read-only audits compared each criterion with the code and with `tests/integration/*`.
2. Four agents, each owning a separate set of files, explored the shared dev app (`.ai/qa/test-env.json`)
   and wrote the tests. Integration runs took turns through a `mkdir` lock.
3. 21 new scenarios, all passing:

| Area | TC ids | Test file |
| --- | --- | --- |
| Accounts | AUTH-006, 007, 008 (+ concurrent first sign-in), 013, 015 | `auth-accounts.integration.test.ts` (new) |
| Sessions | AUTH-009, 010, 011, 012, 014 | `auth-session.integration.test.ts` (new) |
| Roles | ROLE-006 | `roles.integration.test.ts` |
| Invitations | INVITE-003, 004, 005, 006 | `invitations.integration.test.ts` |
| Mentor page/profile | MENTOR-PAGE-003, MENTOR-PROFILE-002, 003 | `mentor-page…`, `mentor-profile…` |
| Availability | AVAILABILITY-003, 004 | `availability.integration.test.ts` |
| Prices | MENTOR-PRICES-004 | `mentor-prices.integration.test.ts` |

New fixtures: `tests/integration/fixtures/accounts.ts` and `fixtures/invitation.ts`. `fixtures/mentor.ts` gained
draft-profile helpers; existing helpers behave the same. Each scenario has a doc under
`.ai/qa/{AREA}/`, and the link from each doc to its `describe(...)` block was checked.

## Outcome
- `npm run test:integration`: 14 files, 85 tests, all passed in about 2.5 minutes. The run used a fresh
  Testcontainers database and a production build.
- `npm run lint`: 0 errors. `npm run typecheck`: clean.
- No production code changed. Committed as `87a68bc` and opened as PR #52.

## Follow-ups for a human
- **Expected results taken from code or observed behaviour, not written in the spec** (each doc flags this):
  - AUTH-009: the replayed cookie gets a 307.
  - AUTH-010: the CSRF message text.
  - AUTH-012: `/register` also redirects home.
  - AUTH-013: an unknown email counts toward the limit.
  - AUTH-014: the `?error=state` copy.
  - INVITE-005: the losing request got a 404; the test accepts 404 `not_found` or 401 `unauthorized`.
  - MENTOR-PROFILE-001: the technology rule has no acceptance criterion in the spec.
  - MENTOR-PROFILE-003: the error is keyed `stackTags.1` with zod's default message.
- **Product finding** (INVITE-006): an unverified account whose email matches the invitation is told to "sign out and sign in with"
  the same address. That advice can't resolve the problem; the account needs to confirm its email.
- **Not covered, deliberately:**
  - Invitation create race, create-for-current-mentor and accept-versus-revoke. These are low priority; service-level tests like TC-MENTOR-PAGE-002 would suit them.
  - A second publish of a start time that is already active (409).
  - A draft having no slug.
  - Renaming a mentor (mentor-page AC6); no rename feature exists.
  - Operator revocation (E01 #14-3) and missing currency or bounds (prices AC6). Both need a different environment at boot.
  - The E01 edge cases that need fault injection.
- TC-MENTOR-PROFILE-001 landed on `master` through PR #50 (`201995a`). PR #51 deliberately removes the
  technology rule to prove this suite catches it and is labelled `do-not-merge`.

## Review fixes (om-auto-review-pr, 2026-09-11)
- TC-INVITE-005 accepts only 404 `not_found` or 401 `unauthorized` for the losing request, so a 500 from a
  broken lock fails the test.
- The harness pins `TRUSTED_PROXY_HOPS=0` in `environment.ts`, so per-IP rate limits cannot leak between files.
- TC-AVAILABILITY-003 seeds inside `try`, so a failed ORM connect still resets mock-mentor.
- TC-AUTH-006, TC-MENTOR-PAGE-003 and TC-MENTOR-PRICES-004 assert exactly one alert (and one invalid control)
  with `get count`. TC-INVITE-006 asserts `button "Sign out"`. TC-AUTH-012 checks each form's own heading.
- `throwawayAccount` refuses a login over the 39-character mock GitHub limit. The rate-limit cleanup only
  clears the `sign-in` per-email bucket, the only one that exists.
- Docs (AUTH-008, AUTH-013, AUTH-015, INVITE-005, MENTOR-PRICES-004, MENTOR-PROFILE-002) and one lesson
  reworded to match what the tests assert.

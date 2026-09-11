# TC-INVITE-005 — Two simultaneous accepts grant the mentor role once

**Implementation:** [`tests/integration/invitations.integration.test.ts`](../../../tests/integration/invitations.integration.test.ts) — `describe('TC-INVITE-005 two accepts of one invitation at the same time')`

| Field | Value |
| --- | --- |
| Test ID | TC-INVITE-005 |
| Category | Invitations / concurrency |
| Priority | Medium |
| Type | API + database |
| Persona | The invited account, with one session used by two tabs |
| Spec | `.ai/specs/2026-09-08-invitations.md`, acceptance criterion for two tabs |

## Prerequisites
- `signInCookieHeader(baseUrl, 'invite-race-<pid>')` creates the verified account and returns one session cookie.
- `seedInvitation` creates a pending invitation for that account's address.
- Cleanup: `deleteInvitationScenario`. Its mentor profile goes too, through the `mentor_profiles` cascade.

## Steps (Given / When / Then)
| # | Step | Expected result |
| --- | --- | --- |
| Given | One pending invitation and one session | — |
| When | Two `POST /api/invitations/<token>/accept` requests are sent at the same time with the same cookie | Exactly one answers `200` `{ ok: true, data: { roles: ["mentee", "mentor"], … } }`. The other is refused with `ok: false` and either `404 not_found` or `401 unauthorized`. |
| Then | Stored state | The invitation is accepted once, roles are exactly `['mentee', 'mentor']` (mentor appears once), and one mentor profile exists. |

## Inferred, not spec-stated — needs human review
- **Status of the losing request.** The spec only requires that the role is granted once. In exploration against the dev app (3 runs) and in the harness, the loser got `404 { code: "not_found", message: "This invitation is not valid." }`. The row lock serializes the two requests and the second finds the invitation already accepted (`invitation.service.ts` `accept`). The test accepts `404 not_found` or `401 unauthorized`, because a loser whose session check runs after the winner's commit legitimately answers 401. Any other status (a 500 from a unique-constraint violation, a 409) fails the test, because it would mean both requests reached the write.
- The two requests are not forced to overlap by a database gate the way TC-MENTOR-PAGE-002 does it. The test proves the observable outcome, not the lock ordering.

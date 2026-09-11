# TC-INVITE-004 — An expired or revoked invitation link is not valid

**Implementation:** [`tests/integration/invitations.integration.test.ts`](../../../tests/integration/invitations.integration.test.ts) — `describe('TC-INVITE-004 expired and revoked invitation links')`

| Field | Value |
| --- | --- |
| Test ID | TC-INVITE-004 (two cases: `expired`, `revoked`) |
| Category | Invitations / link lifecycle |
| Priority | High |
| Type | UI (agent-browser) + API + database |
| Persona | The invited account itself: verified, with a matching email |
| Spec | `.ai/specs/2026-09-08-invitations.md`, acceptance criterion for expired or revoked links |

## Prerequisites
- `seedInvitation` creates an invitation for `invite-<state>-<pid>@devmentor.test`.
  - The expired case sets `expiresAt` to one day in the past.
  - The revoked case sets `revokedAt` to now.
- The invitee signs in with mock GitHub as `invite-<state>-<pid>`, so the email matches. The only reason for refusal is the link's lifecycle.
- Cleanup: `deleteInvitationScenario`.

## Steps (Given / When / Then)
| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | An expired or revoked invitation; its own invitee is signed in | — |
| When | The invitee opens `/invitation/<token>` | The page contains only the alert "This invitation is not valid.": no invitation details and no `button "Accept invitation"`. |
| When | The invitee POSTs `/api/invitations/<token>/accept` | `404` `{ ok: false, error: { code: "not_found", message: "This invitation is not valid." } }` |
| Then | Nothing is granted | `acceptedAt` is null, roles are `['mentee']`, and no mentor profile exists. |

Screenshots: `test-results/integration/invitation-expired.png`, `invitation-revoked.png`.

## Edge cases
- An unknown token shows the same sentence (TC-INVITE-002). The three cases cannot be told apart, which is the intended non-enumeration.
- Deterministic: expiry is set relative to now (−24 h), so the test never depends on a calendar date.

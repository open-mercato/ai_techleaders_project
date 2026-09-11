# TC-INVITE-003 — A different signed-in account cannot accept an invitation

**Implementation:** [`tests/integration/invitations.integration.test.ts`](../../../tests/integration/invitations.integration.test.ts) — `describe('TC-INVITE-003 signed in with a different account')`

| Field | Value |
| --- | --- |
| Test ID | TC-INVITE-003 |
| Category | Invitations / acceptance guard |
| Priority | High |
| Type | UI (agent-browser) + API + database |
| Persona | A signed-in developer whose email is not the invited address |
| Spec | `.ai/specs/2026-09-08-invitations.md`, acceptance criterion for an email mismatch |

## Prerequisites
- `seedInvitation` (`tests/integration/fixtures/invitation.ts`) creates a usable invitation for `invite-owner-<pid>@devmentor.test`. No account exists for that address.
- The viewer signs in with mock GitHub as `invite-other-<pid>`, which creates `invite-other-<pid>@devmentor.test` with the verified `mentee` role.
- Cleanup: `deleteInvitationScenario` removes the invitation and both addresses' users.

## Steps (Given / When / Then)
| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | A pending invitation for the owner address; the viewer is signed in as another account | — |
| When | The viewer opens `/invitation/<token>` | `heading "Use the invited account"`. The alert reads: "This invitation was sent to invite-owner-<pid>@devmentor.test. You are signed in as invite-other-<pid>@devmentor.test. Sign out, then sign in with invite-owner-<pid>@devmentor.test to accept it." There is a `button "Sign out"` and no `button "Accept invitation"`. |
| When | The viewer POSTs `/api/invitations/<token>/accept` with the CSRF header | `403` `{ ok: false, error: { code: "forbidden", message: "Sign in with the verified email address this invitation was sent to." } }` |
| Then | Nothing is granted | The invitation's `acceptedAt` is null, the viewer's roles are `['mentee']`, and no mentor profile exists. |

Screenshot: `test-results/integration/invitation-wrong-account.png`.

## Edge cases
- The unverified-address variant is TC-INVITE-006.
- The API is checked on its own, not only the hidden button, so a hand-crafted request is refused as well.

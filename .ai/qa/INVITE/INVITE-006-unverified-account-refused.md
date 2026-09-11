# TC-INVITE-006 — An invited account with an unverified email is refused

**Implementation:** [`tests/integration/invitations.integration.test.ts`](../../../tests/integration/invitations.integration.test.ts) — `describe('TC-INVITE-006 an invited account whose email is not verified')`

| Field | Value |
| --- | --- |
| Test ID | TC-INVITE-006 |
| Category | Invitations / acceptance guard |
| Priority | High |
| Type | UI (agent-browser) + API + database |
| Persona | An account whose email equals the invited address but whose `emailVerifiedAt` is null |
| Spec | `.ai/specs/2026-09-08-invitations.md`, acceptance criterion for an unverified account ("refused the same way") |

## Prerequisites
- `signInCookieHeader(baseUrl, 'invite-unverified-<pid>')` creates the account.
- `seedInvitation` creates an invitation for the same address.
- `setEmailVerifiedAt(…, null)` then marks the address unverified.
- Cleanup: `deleteInvitationScenario` deletes the scenario-owned account. No shared persona is modified, so nothing needs restoring.

## Steps (Given / When / Then)
| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | The invitation's address matches the account, but it is not verified | — |
| When | The account opens `/invitation/<token>` | `heading "Use the invited account"`, `button "Sign out"`, and no `button "Accept invitation"`. This is the same state as a different account (TC-INVITE-003). |
| When | It POSTs `/api/invitations/<token>/accept` | `403` `{ ok: false, error: { code: "forbidden", message: "Sign in with the verified email address this invitation was sent to." } }`: the same code and message as a mismatch. |
| Then | Nothing is granted | `acceptedAt` is null, roles are `['mentee']`, and no mentor profile exists. |

## Findings for human review
- **Misleading copy (not asserted).** With a matching but unverified address the alert reads "This invitation was sent to X. You are signed in as X. Sign out, then sign in with X to accept it." The same address appears three times, and the advice cannot help: the real fix is to verify the email. The test does not assert this sentence, so it does not freeze the wording. Consider a dedicated "verify your email" message (`packages/app/src/app/invitation/[token]/page.tsx`).
- Mock GitHub sign-in of an already-linked account does not re-verify its email, so the unverified state survives the browser sign-in the test performs.

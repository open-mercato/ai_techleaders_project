# TC-AUTH-006 — GitHub sign-in is refused when its email matches an unconfirmed registration

**Implementation:** [`tests/integration/auth-accounts.integration.test.ts`](../../../tests/integration/auth-accounts.integration.test.ts) — `describe('TC-AUTH-006 a GitHub sign-in whose email matches an unconfirmed registration')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-006 |
| Category | Authentication / account takeover defence |
| Priority | High |
| Type | UI (agent-browser) + database assertion |
| Persona | Signed-out visitor with a throwaway GitHub login |
| Spec | `.ai/specs/2026-09-04-accounts-and-roles.md`, story #12 criterion 6 and edge case 4 |

## Description

Someone registered an address with a password but never opened the confirmation link. A GitHub
account reporting the same address must not be linked onto that row (matching on an unproven
email is an account-takeover vector), and no second account may be created for the address.

## Prerequisites

- A unique login `acct-unverified-<pid>-<time>` (mock GitHub reports `<login>@devmentor.test`).
- The row is created through the real `POST /api/auth/register`, so it is a genuine unconfirmed
  password row. Cleanup: `deleteAccounts` removes the user and its per-email rate-limit counters.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | `POST /api/auth/register` for the address, link not opened | 200; row has a password hash, `email_verified_at` null |
| When | The browser opens `/api/auth/github?login=<login>` | The flow ends on `/sign-in?error=email` |
| Then | The sign-in page explains the refusal | `heading "Welcome back"`; the only `[role="alert"]` reads "DevMentor could not use the email address on that GitHub account. Verify a primary address in your GitHub email settings, and confirm any DevMentor registration for that address, then try again." |
| Then | Nobody is signed in | The browser cookie jar holds no `devmentor_session` |
| Then | Nothing was linked or created | Exactly one row matches the address or `mock-<login>`; its `github_id` is null, it still has a password, is unconfirmed, roles `['mentee']` |

Screenshot: `test-results/integration/auth-github-unverified-email.png`.

## Edge cases and notes

- The service throws a 409 `ConflictError` with its own sentence; the callback route turns every
  409 into the `email` code, so the user sees the sign-in page copy, not the service message.
- The alert copy is copied from `sign-in/page.tsx` because the page module is not importable
  from the harness. If the copy changes, update the constant in the test.

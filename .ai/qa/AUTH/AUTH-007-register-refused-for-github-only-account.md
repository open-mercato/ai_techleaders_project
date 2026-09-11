# TC-AUTH-007 — Registering an address that belongs to a GitHub-only account is refused

**Implementation:** [`tests/integration/auth-accounts.integration.test.ts`](../../../tests/integration/auth-accounts.integration.test.ts) — `describe('TC-AUTH-007 registering an address that belongs to a GitHub-only account')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-007 |
| Category | Authentication / registration |
| Priority | High |
| Type | API + database assertion |
| Persona | A developer who first signed in with GitHub |
| Spec | `.ai/specs/2026-09-04-accounts-and-roles.md`, story #13 criterion 3 and edge case 14 |

## Description

A GitHub-only account (GitHub id set, no password) tries to add a password by registering the
same address. The app must refuse with 409 and a message pointing at GitHub, and must not write a
password hash onto the existing account.

## Prerequisites

- A unique login `acct-github-only-<pid>-<time>`, signed in once through the real mock GitHub flow
  (`signInCookieHeader`), which creates the GitHub-only row. Cleanup: `deleteAccounts`.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | First GitHub sign-in for the login | One row: `github_id = mock-<login>`, no password, confirmed |
| When | `POST /api/auth/register` with that address and a valid password | — |
| Then | The request is refused | 409 and exactly `{ ok: false, error: { code: "conflict", message: "This email address is already registered through GitHub. Use \"Sign in with GitHub\" instead of a password." } }`; no `Set-Cookie` |
| Then | The account is unchanged | Still one row, same id, same GitHub id, still no password, still confirmed |

## Edge cases and notes

- This message is the spec's one recorded deviation from "never reveal whether an email is
  registered". Login stays generic; that side is covered by TC-AUTH-004.
- The message is copied from `GITHUB_ACCOUNT_MESSAGE` in `user.service.ts`; `@devmentor/core`
  does not export it.

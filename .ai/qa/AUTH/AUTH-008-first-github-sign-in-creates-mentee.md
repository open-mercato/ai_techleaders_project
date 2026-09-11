# TC-AUTH-008 — A first GitHub sign-in creates exactly one confirmed mentee account

**Implementation:** [`tests/integration/auth-accounts.integration.test.ts`](../../../tests/integration/auth-accounts.integration.test.ts) — `describe('TC-AUTH-008 a developer signing in with GitHub for the first time')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-008 |
| Category | Authentication / account creation |
| Priority | High |
| Type | UI (agent-browser) + API + database assertion |
| Persona | A developer DevMentor has never seen |
| Spec | `.ai/specs/2026-09-04-accounts-and-roles.md`, story #12 criterion 1; edge case 9 and primitives B10 for the concurrent case |

## Description

The existing auth scenarios sign in seeded personas, which only exercises the "link onto an
existing row" branch. This scenario covers the create branch: a new GitHub developer gets a
confirmed mentee account and lands on `/home`. A second `it` covers the concurrent case: three
first sign-ins for the same new login must still leave exactly one account.

## Prerequisites

- A unique login per `it` (`acct-first-github-…`, `acct-first-github-race-…`) that has no row.
  Cleanup: `deleteAccounts`.

## Steps (Given / When / Then)

**Case 1: one browser sign-in**

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | No row holds the address or `mock-<login>` | `storedAccounts` returns `[]` |
| When | The browser opens `/api/auth/github?login=<login>` (`signInAs`) | Lands on `/home`; the session cookie is stored |
| Then | The mentee home renders | `heading "My sessions"` and `button "Sign out"` |
| Then | One confirmed mentee account exists | One row: `github_id = mock-<login>`, no password, confirmed, roles `['mentee']` |

**Case 2: three first sign-ins at once**

| # | Step | Expected result (observed) |
| --- | --- | --- |
| When | Three `signInCookieHeader` flows for the same new login run concurrently | All three complete with a session cookie |
| Then | Every session works | `GET /home` with each cookie answers 200 |
| Then | Only one account exists | Exactly one row, `github_id = mock-<login>`, roles `['mentee']` |

Screenshot: `test-results/integration/auth-github-first-sign-in.png`.

## Edge cases and notes

- Verified on the first harness run: the app log recorded "lost the GitHub identity race,
  re-reading the winner" twice. The concurrent case really reaches the
  unique-constraint recovery path; it is not passing just because the requests were serialized.
- Whether all three land on the same row is inferred from "exactly one row + three working
  sessions". The spec requires both sign-ins to succeed and one account to exist; it does not
  require equal session payloads.

# TC-AUTH-013 — The sixth password sign-in attempt for one address is rate-limited

**Implementation:** [`tests/integration/auth-accounts.integration.test.ts`](../../../tests/integration/auth-accounts.integration.test.ts) — `describe('TC-AUTH-013 repeated password sign-in attempts for one address')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-013 |
| Category | Authentication / brute-force defence |
| Priority | High |
| Type | API |
| Persona | Signed-out caller |
| Spec | `.ai/specs/2026-09-04-accounts-and-roles.md` edge case 17; `.ai/specs/2026-09-04-platform-primitives.md` B8 |

## Description

TC-DB-001 tests the limiter's SQL directly. This scenario proves the HTTP route applies it:
five failed attempts for one address answer 401, the sixth answers 429 with `Retry-After`, and the
limit belongs to that address only.

## Prerequisites

- Two unique addresses with no account (`acct-rate-limited-…`, `acct-rate-unrelated-…`).
- `TRUSTED_PROXY_HOPS` is unset (0) in both the harness and the dev env, so the per-IP bucket is
  disabled and only the per-email bucket (5 per 15 minutes, `SIGN_IN_EMAIL_POLICY`) applies. The
  scenario therefore cannot rate-limit other scenarios.
- Cleanup: `deleteAccounts` deletes the `sign-in:email:<sha256>` counters for both addresses.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| When | Attempts 1 to 5: `POST /api/auth/login` with a wrong password | Each 401 `{ code: "unauthorized", message: INVALID_CREDENTIALS_MESSAGE }` |
| When | Attempt 6 | — |
| Then | The attempt is refused | 429, `code: "rate_limited"`, `message: RATE_LIMITED_MESSAGE` ("Too many attempts. Please wait a few minutes and try again."), no `Set-Cookie` |
| Then | The wait is stated | `Retry-After` is an integer in 1..900 (observed 900) and equals `error.retryAfterSeconds` |
| Then | Other addresses are unaffected | One attempt for a different unknown address answers 401, not 429 |

## Edge cases and notes

- Not covered: whether a *correct* password is also refused once the bucket is full. Only the
  seeded personas have passwords, and filling their bucket would break other scenarios within
  the 15-minute window.
- The spec does not say whether an unknown address counts like a wrong password (edge case 13
  says only "the attempt is counted"). In the code both count toward the per-email bucket; this
  scenario relies on that.

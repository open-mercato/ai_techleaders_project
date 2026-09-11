# TC-AUTH-011 — An unsafe returnTo falls back to the role home

**Implementation:** [`tests/integration/auth-session.integration.test.ts`](../../../tests/integration/auth-session.integration.test.ts) — `describe('TC-AUTH-011 an unsafe returnTo falls back to the role home')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-011 |
| Category | Auth / open-redirect defence |
| Priority | High |
| Type | API (the mock GitHub round trip over HTTP, reading the callback's `Location`) |
| Persona | A new developer created by the test (`it-return-to-<pid>`), whose home is `/home` |

## Description

Signing in through `/api/auth/github?returnTo=…` must never send the browser off-site or into an
API route. An unsafe value is dropped and the developer lands on their role home, while a
same-origin page path is kept, query included (edge case 22 and B7 in
`.ai/specs/2026-09-04-accounts-and-roles.md`).

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| When | Sign in with `returnTo=//evil.example` | Callback answers 302 to `/home`. |
| When | Sign in with `returnTo=https://evil.example/x` | Callback answers 302 to `/home`. |
| When | Sign in with `returnTo=/api/users` | Callback answers 302 to `/home`. |
| When | Sign in with `returnTo=/home?from=integration` | Callback answers 302 to `/home?from=integration`. |
| Then | Only one account exists for the login | One `users` row for `it-return-to-<pid>@devmentor.test`. |

## Edge cases and notes

- `/_next/…` is also rejected by `safeReturnTo`, but only its unit tests cover that.
- The destination is read from the callback's `Location` header rather than a browser, because the
  redirect target is the whole behaviour under test.

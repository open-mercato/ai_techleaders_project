# TC-AUTH-010 — Sign-out needs the CSRF header but not a readable session

**Implementation:** [`tests/integration/auth-session.integration.test.ts`](../../../tests/integration/auth-session.integration.test.ts) — `describe('TC-AUTH-010 sign-out API edges')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-010 |
| Category | Auth / session API |
| Priority | Medium |
| Type | API |
| Persona | A new developer created by the test (`it-logout-csrf-<pid>`); no account for the second case |

## Description

Two edges of `POST /api/auth/logout` from `.ai/specs/2026-09-04-accounts-and-roles.md`:
- A state-changing request without `x-devmentor-request` is refused before the route runs (edge case 23).
- Signing out with a cookie the server cannot read still succeeds and clears it (edge case 27).

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | A developer holds a valid session cookie | `GET /home` answers 200. |
| When | `POST /api/auth/logout` with the cookie but without `x-devmentor-request` | 403 with `{ ok: false, error: { code: "forbidden", message: "This request must carry the x-devmentor-request header. Send it through the app rather than as a plain form submission." } }` and no `Set-Cookie`. |
| Then | The session was not ended | `GET /home` with the same cookie still answers 200. |
| Given | A request carries `devmentor_session=tampered.session.value` | — |
| When | `POST /api/auth/logout` with the CSRF header | 200 with `{ ok: true, data: null }`. |
| Then | The unreadable cookie is expired | A `Set-Cookie` that starts with `devmentor_session=;` and has `Max-Age=0`. |

## Edge cases and notes

- The exact 403 message comes from `apiHandler`; the spec names only the status.
- The test does not check the "no `session_version` bump" half of edge case 27. With no readable
  session there is no user row to observe.

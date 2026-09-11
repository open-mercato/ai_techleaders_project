# TC-AUTH-009 — Signing out ends the session, including a copied cookie

**Implementation:** [`tests/integration/auth-session.integration.test.ts`](../../../tests/integration/auth-session.integration.test.ts) — `describe('TC-AUTH-009 signing out ends the session')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-009 |
| Category | Auth / session |
| Priority | High |
| Type | UI (agent-browser) plus HTTP replay |
| Persona | A new developer created by the test (`it-sign-out-<pid>`, mock GitHub) |

## Description

A signed-in developer clicks **Sign out**. The browser loses its session and lands on the public
home page, and a copy of the session cookie taken before signing out stops working (edge case 11 of
`.ai/specs/2026-09-04-accounts-and-roles.md`; hard navigation to `/` per its step at line 895).

## Prerequisites

- A pid-suffixed GitHub login, so bumping `session_version` never affects the shared personas.
- Cleanup: the created user is deleted in `finally`; the browser session is closed.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | The developer signs in through `/api/auth/github?login=it-sign-out-<pid>` | Lands on `/home`; the copied `devmentor_session` cookie opens `GET /home` with 200. |
| When | They click `button "Sign out"` | `POST /api/auth/logout` succeeds and the browser navigates to `/`. |
| Then | The browser is signed out | URL path `/`, `heading "Grow faster with the right mentor."`, no `button "Sign out"`, no `devmentor_session` in the cookie jar. |
| Then | The copied cookie is dead | `GET /home` with the copied cookie answers 307 to `/sign-in?returnTo=%2Fhome`. |

Screenshot: `test-results/integration/auth-signed-out-home.png`.

## Edge cases and notes

- The 307 status is Next's `redirect()` from the page guard; it was observed, not specified.
- Bumping `session_version` also ends the user's other sessions. That is why the test uses its own
  user instead of `mock-mentee`.

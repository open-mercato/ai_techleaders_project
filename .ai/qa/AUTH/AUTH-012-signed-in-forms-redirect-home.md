# TC-AUTH-012 — A signed-in visitor opening sign-in or register goes home

**Implementation:** [`tests/integration/auth-session.integration.test.ts`](../../../tests/integration/auth-session.integration.test.ts) — `describe('TC-AUTH-012 a signed-in visitor opening sign-in or register')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-012 |
| Category | Auth / navigation |
| Priority | Medium |
| Type | UI (agent-browser) |
| Persona | A new developer created by the test (`it-signed-in-forms-<pid>`) |

## Description

A developer who is already signed in and opens `/sign-in` or `/register` is sent to their role home
and never sees the forms (edge case 28 in `.ai/specs/2026-09-04-accounts-and-roles.md`).

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | The developer signs in with mock GitHub | Lands on `/home`. |
| When | They open `/sign-in` | URL path `/home`; `heading "My sessions"`; no `heading "Welcome back"`. |
| When | They open `/register` | URL path `/home`; `heading "My sessions"`; no `heading "Welcome back"`. |

Screenshot: `test-results/integration/auth-signed-in-register-redirect.png`.

## Traceability and review

- **Needs human review:** edge case 28 names only `/sign-in`. The `/register` redirect comes from
  the code (`register/page.tsx` calls `redirectIfSignedIn`) and from the running app.

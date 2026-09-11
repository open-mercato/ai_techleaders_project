# TC-AUTH-014 — A callback with a state this browser was never given is refused

**Implementation:** [`tests/integration/auth-session.integration.test.ts`](../../../tests/integration/auth-session.integration.test.ts) — `describe('TC-AUTH-014 a callback whose state this browser was never given')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-014 |
| Category | Auth / OAuth state (login CSRF) |
| Priority | High |
| Type | API plus UI (agent-browser) |
| Persona | Signed-out browser; the callback names a login no account exists for (`it-forged-state-<pid>`) |

## Description

A browser arrives at `/api/auth/github/callback` with a `state` that was never issued to it: no
`devmentor_oauth_state` cookie and a made-up value. The sign-in is refused before the code is
exchanged, the user lands on sign-in with an explanation, and nothing is created (edge case 6 in
`.ai/specs/2026-09-04-accounts-and-roles.md`).

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| When | `GET /api/auth/github/callback?code=mock-code-it-forged-state-<pid>&state=forged` without a state cookie | 302 to `/sign-in?error=state`; `Set-Cookie` expires `devmentor_oauth_state`; no `devmentor_session` is set. |
| When | A browser opens the same URL | It lands on `/sign-in?error=state`. |
| Then | The notice explains what happened | `[role="alert"]` reads "That sign-in request could not be verified, usually because it was left open too long. Start again from this page."; `heading "Welcome back"` and `link "Continue with GitHub"` are shown. |
| Then | Nothing was created | No session cookie in the browser; no `users` row for `it-forged-state-<pid>@devmentor.test`. |

Screenshot: `test-results/integration/auth-forged-state.png`.

## Traceability and review

- **Needs human review:** the spec names the redirect but not the notice copy. The text comes from
  `ERROR_MESSAGES.state` in `packages/app/src/app/(auth)/sign-in/page.tsx`.
- A state that is signed but expired, or that has a mismatched cookie, takes the same `?error=state`
  path. Only the missing-cookie form is exercised here.

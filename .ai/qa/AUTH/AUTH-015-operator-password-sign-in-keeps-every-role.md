# TC-AUTH-015 — A password sign-in keeps every role the account holds

**Implementation:** [`tests/integration/auth-accounts.integration.test.ts`](../../../tests/integration/auth-accounts.integration.test.ts) — `describe('TC-AUTH-015 a password sign-in by the operator, who also holds mentor')`

| Field | Value |
| --- | --- |
| Test ID | TC-AUTH-015 |
| Category | Authentication / roles |
| Priority | Medium |
| Type | UI (agent-browser) |
| Persona | Seeded `mock-operator@devmentor.test` (roles `operator` and `mentor`, has the seed password) |
| Spec | `.ai/specs/2026-09-04-accounts-and-roles.md`, story #13 criterion 4 |

## Description

TC-AUTH-004 covers password sign-in only for a single-role mentee. TC-ROLE-004 covers the
two-role operator only through GitHub. This scenario closes the gap between them: a password
sign-in by a two-role account lands on `/admin` and keeps the mentor surface reachable.

## Prerequisites

- The seeder gives `mock-operator` the committed `SEED_PASSWORD` (`database.seeder.ts`,
  `password: true`) and `OPERATOR_EMAILS` is forced to that address by `environment.ts`.
- Read-only for the persona: nothing about the operator row is changed.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | `/sign-in`, "Sign in with email" group visible | — |
| When | Fill "Email address" with `mock-operator@devmentor.test`, "Password" with the seed password, click "Sign in" | Lands on `/admin` |
| Then | The operator surface renders with both role navigations | `heading "Dashboard"`, `link "Users"`, `link "Mentor workspace"` |
| When | Click `link "Mentor workspace"` (exact name) | URL ends in `/mentor` |
| Then | The mentor surface renders and still offers the operator link | `heading "Mentor workspace"`, `link "Users"` |

Screenshot: `test-results/integration/auth-operator-password-admin.png`.

## Edge cases and notes

- The exact-name link match matters: the topbar text "Your DevMentor workspace" would satisfy a
  substring match (see `assertions.ts`).
- The attempt adds one entry to the operator's `sign-in:email` counter. The harness database is
  new on every run, so this counter is not cleaned up.

# TC-ROLE-006 — A signed-in mentee is refused the mentor profile API

**Implementation:** [`tests/integration/roles.integration.test.ts`](../../../tests/integration/roles.integration.test.ts) — `describe('TC-ROLE-006 /api/mentors/me refuses a signed-in mentee')`

| Field | Value |
| --- | --- |
| Test ID | TC-ROLE-006 |
| Category | Authorization / roles |
| Priority | High |
| Type | API |
| Persona | Seeded `mock-mentee` (refused), seeded `mock-mentor` (positive control) |
| Spec | `.ai/specs/2026-09-04-accounts-and-roles.md`, story #14 criterion 1 and edge case 19 (API half) |

## Description

TC-ROLE-001 proves a mentee is redirected away from mentor *screens*. This scenario proves the
matching mentor *API* refuses the same caller with 403 rather than leaking the data or asking
them to sign in again.

## Prerequisites

- Both personas sign in through the real mock GitHub flow (`signInCookieHeader`). Read-only.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | The mentor calls `GET /api/mentors/me` | 200, `ok: true`, `data.displayName = "Mock Mentor"` (the route works) |
| When | The mentee calls `GET /api/mentors/me` | — |
| Then | The call is refused as a permissions decision | 403 and exactly `{ ok: false, error: { code: "forbidden", message: "You do not have access to this resource" } }`; no `data` |

## Edge cases and notes

- Observed while exploring: without any cookie the same route answers 401 `unauthorized`
  "Authentication required". A signed-in caller gets 403 because signing in again would not
  help. The 401 case is not asserted here.

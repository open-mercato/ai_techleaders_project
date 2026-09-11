# TC-MENTOR-PROFILE-003: A technology outside the approved four is refused

**Implementation:** [`tests/integration/mentor-profile.integration.test.ts`](../../../tests/integration/mentor-profile.integration.test.ts), `describe('TC-MENTOR-PROFILE-003 technologies outside the approved four')`

| Field | Value |
| --- | --- |
| Test ID | TC-MENTOR-PROFILE-003 |
| Category | Mentor profile / validation |
| Priority | Medium |
| Type | API, with database and UI assertions |
| Persona | Signed-in mentor (`mock-mentor`) |
| Spec | `.ai/specs/2026-09-08-mentor-page.md`, acceptance criterion "Given a mentor choosing stack tags … limited to TypeScript, React, Python and AI agents" (R16, D21) |

## Prerequisites

Fixture `seedPublishedMentorProfile` creates a published page with the stored technologies `['TypeScript', 'AI agents']`. Cleanup: `resetPublishedMentorProfile`, then close the browser session.

## Steps

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | A mentor with two approved technologies | — |
| When | `PUT /api/mentors/me` with `{ "stackTags": ["TypeScript", "Go"] }` | `422 {"ok":false,"error":{"code":"validation_failed","message":"Validation failed","fieldErrors":{"stackTags.1":["Invalid option: expected one of \"TypeScript\"\|\"React\"\|\"Python\"\|\"AI agents\""]}}}` |
| Then | Stored technologies are unchanged | `stackTags = ['TypeScript', 'AI agents']` |
| Then | The editor offers only the approved set | `/mentor/profile` renders exactly four checkboxes, in this order: TypeScript, React, Python, AI agents. |

## Edge cases and notes

- **Inferred, needs review:** the error key is the array index (`stackTags.1`), not `stackTags`, and the message is zod's default text. Both were observed, but neither is a product contract. A CrudForm keyed on `stackTags` would not show this error next to the field. That doesn't matter today, because the UI can't submit an unknown tag.
- Also observed: five tags return 422 with `fieldErrors.stackTags: ["Too big: expected array to have <=4 items"]` plus an index error. That case isn't covered here.

# TC-MENTOR-PAGE-003: Publishing is refused when the public-work link is missing

**Implementation:** [`tests/integration/mentor-page.integration.test.ts`](../../../tests/integration/mentor-page.integration.test.ts), `describe('TC-MENTOR-PAGE-003 publish requires a public-work link')`

| Field | Value |
| --- | --- |
| Test ID | TC-MENTOR-PAGE-003 |
| Category | Mentor page / publication gate |
| Priority | High |
| Type | UI (agent-browser), with a database assertion |
| Persona | Signed-in mentor (`mock-mentor`) |
| Spec | `.ai/specs/2026-09-08-mentor-page.md`, acceptance criterion "Given a mentor with no public-work link…" (R04, negative) |

## Prerequisites

Fixture `seedMentorProfileMissingPublicWorkUrl` creates an unpublished draft with no link, a bio and `TypeScript` selected. Cleanup: `resetPublishedMentorProfile`, then close the browser session.

## Steps

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | Mentor opens `/mentor/profile` | The readiness list shows `heading "Add a link to your public work."` as Required and the other two as Complete. `checkbox "TypeScript"` is checked and `button "Publish page"` is shown. |
| When | Mentor clicks **Publish page** | The publish request is refused. |
| Then | The refusal is named on the field | Exactly one `[role="alert"]` appears, with the text `Add a link to your public work.` The only control with `aria-invalid="true"` is `name="publicWorkUrl"`. |
| Then | Nothing is published | `button "Publish page"` is still offered and `button "Unpublish page"` never appears. The row keeps `publishedAt = null`, `slug = null` and `publicWorkUrl = null`. |

Screenshot: `test-results/integration/mentor-page-publish-blocked-missing-link.png`.

## Edge cases and notes

- The readiness heading and the field alert share the same text, so the test waits for `[role="alert"]` rather than for the text.
- The missing-technology case is TC-MENTOR-PROFILE-001.

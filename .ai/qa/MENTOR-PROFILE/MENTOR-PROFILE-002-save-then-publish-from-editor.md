# TC-MENTOR-PROFILE-002: Saved details are published and shown to a signed-out visitor

**Implementation:** [`tests/integration/mentor-profile.integration.test.ts`](../../../tests/integration/mentor-profile.integration.test.ts), `describe('TC-MENTOR-PROFILE-002 save then publish from the editor')`

| Field | Value |
| --- | --- |
| Test ID | TC-MENTOR-PROFILE-002 |
| Category | Mentor profile / editor happy path |
| Priority | High |
| Type | UI (agent-browser, two sessions), with a database assertion |
| Personas | Signed-in mentor (`mock-mentor`); signed-out visitor |
| Spec | `.ai/specs/2026-09-08-mentor-page.md`, acceptance criteria "saves a link … and a bio … Then the mentor page shows both" (R04) and "copies the share link and a signed-out visitor opens it" (D21) |

## Prerequisites

Fixture `seedEmptyMentorProfileDraft` creates an unpublished draft with no link, no bio and no technologies. Cleanup: `resetPublishedMentorProfile`, then close both browser sessions.

## Steps

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | Mentor opens `/mentor/profile` | The editor loads and shows `Ready to publish?`. The fixture has left the work link, bio and technologies empty. |
| When | Mentor fills **Public work link** and **About your work**, checks **React** and clicks **Save profile** | The saved profile reloads as publishable and the `Page preview` section appears. |
| When | Mentor clicks **Publish page** | `heading "Your share link"` appears with a link `<APP_URL>/m/<slug>`, and the Publication card now offers `button "Unpublish page"`. |
| Then | A signed-out visitor opens the share link | The page shows `heading "Mock Mentor"`, the saved bio as text, `list "Technology stacks"` containing `React`, and a link whose `href` is the saved public-work URL. |
| Then | The data is stored | `publishedAt` is set, `slug` matches the share-link path, and `publicWorkUrl`, `bio` and `stackTags = ['React']` match what was entered. |

Screenshot: `test-results/integration/mentor-profile-saved-and-published.png`.

## Edge cases and notes

- The slug comes from the display name ("Mock Mentor" gives `mock-mentor`). The test reads it from the share link instead of hardcoding it.
- The test waits for `Page preview` after saving. That section appears only once the reloaded profile is publishable, which proves the save finished before Publish is clicked.

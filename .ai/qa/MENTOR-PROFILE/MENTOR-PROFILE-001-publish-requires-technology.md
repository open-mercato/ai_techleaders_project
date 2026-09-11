# TC-MENTOR-PROFILE-001 — Publishing is refused when no technology is selected

**Implementation:** [`tests/integration/mentor-profile.integration.test.ts`](../../../tests/integration/mentor-profile.integration.test.ts) — `describe('TC-MENTOR-PROFILE-001 publish requires at least one technology')`

| Field | Value |
| --- | --- |
| Test ID | TC-MENTOR-PROFILE-001 |
| Category | Mentor profile / publication gate |
| Priority | High |
| Type | UI (agent-browser), with a database assertion |
| Persona | Signed-in mentor (`mock-mentor`) |

## Description

A mentor who has filled in everything except their technologies opens the profile editor
(`/mentor/profile`, the "Mentor profile" navigation item; the mentor workspace links to it as
"Edit profile") and clicks **Publish page**. The page must stay unpublished, and the reason must
appear next to the Technologies field.

## Prerequisites

- Fixture `seedMentorProfileMissingStackTags` (in `tests/integration/fixtures/mentor.ts`) sets the
  mock mentor's profile to: public work link set, bio set, **no technologies**, unpublished, no
  slug. The fixture creates this state itself, so the scenario does not depend on seeded demo data.
- Cleanup: `resetPublishedMentorProfile` in `finally`, plus closing the browser session.

## Steps (Given / When / Then)

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | Mentor signs in with mock GitHub and opens `/mentor/profile` | Page shows `heading "Mentor profile"`, the readiness list with "Add a link to your public work." and "Write a description of the work you have done." marked Complete, `heading "Choose at least one technology."` marked Required, and `button "Publish page"`. All four technology checkboxes (TypeScript, React, Python, AI agents) are unchecked. |
| When | Mentor clicks **Publish page** without selecting a technology | `POST /api/mentors/me/publish` is refused with `fieldErrors.stackTags`. |
| Then | The form shows the refusal on the field | Exactly one `[role="alert"]` appears, under Technologies, with the text `Choose at least one technology.` |
| Then | The page stays unpublished in the UI | The Publication card still offers `button "Publish page"`; there is no `button "Unpublish page"` and no share link. |
| Then | The page stays unpublished in storage | The `mentor_profiles` row still has `publishedAt = null`, `slug = null`, `stackTags = []`. |

Screenshot: `test-results/integration/mentor-profile-publish-blocked-missing-technology.png`.

## Edge cases and notes

- **Same text in two places.** "Choose at least one technology." is always visible as the readiness
  item heading, even before a publish attempt. `wait --text` would therefore pass before the publish
  request finishes. The test waits for `[role="alert"]` instead; the readiness list has no alert
  role, so the alert can only come from the refused publish.
- Only the technology requirement is left unmet, so the refusal is caused by the technology rule
  alone and the other two readiness items cannot hide a failure.
- Not covered here (candidates for separate scenarios): removing every technology from an
  already published page (`update` re-asserts readiness when `publishedAt` is set), and refusing a
  fifth technology (`max(4)` in `mentorProfileUpdateSchema`).

## Traceability and review

- The rule is in `packages/core/src/services/mentors/readiness.ts` (`mentorPagePublishable`,
  key `stackTags`, label "Choose at least one technology.").
- `.ai/specs/2026-09-08-mentor-page.md` (UI/UX section) says a refused publish returns `fieldErrors`
  keyed to the field so the message lands next to the input. Its acceptance criteria state this
  explicitly only for a missing public-work link. **Needs human review:** the expected result for a
  missing technology comes from the code and from behaviour observed in the running app, not from a
  written acceptance criterion.

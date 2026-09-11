# PR #44 UI QA — E02 slices 1 and 2

Result: **PASS**

Environment: local Next.js development server with an ephemeral PostgreSQL database, all migrations and seed data applied, exercised through the repository-pinned `agent-browser` 0.36.0 and mock GitHub identity adapter.

## Verified journeys

- Invitation page renders the invited email, session facts and selected technologies.
- GitHub sign-in returns to the invitation and identifies the matching account.
- Acceptance preserves the existing mentee role, adds mentor navigation and shows the exact two-week publication deadline.
- Reusing the accepted token shows the single non-enumerating invalid-invitation state.
- Publishing an incomplete mentor profile maps recovery messages to the missing fields.
- Saving work URL, bio and technologies updates the readiness checklist and shared page preview.
- Publishing exposes a stable share URL and copying it succeeds.
- The signed-out page contains only the intended public profile content; no rating, review, score or ranking fields are present.
- Unpublishing makes the public URL return 404 while retaining the owner share link; republishing restores the same URL.
- Public and owner views remain usable at 320 px and 375 px mobile widths.
- Browser error logs were empty after the completed owner and signed-out journeys.

## Evidence

- `invitation-desktop.png`
- `invitation-accepted-mentor-home-desktop.png`
- `mentor-profile-published-desktop.png`
- `mentor-profile-published-mobile-dark.png`
- `public-mentor-page-desktop.png`
- `public-mentor-page-mobile.png`

No invitation token is present in the report or screenshot filenames.

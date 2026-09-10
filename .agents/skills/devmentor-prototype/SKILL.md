---
name: devmentor-prototype
description: Build or update finished DevMentor UI flows using the shared design system, Storybook and the connected local prototype. Use for epic mockups, screen design and implementation handoff in this repository.
---

# DevMentor prototype

Deliver screens composed from `@devmentor/ui`, with working transitions and named
failure states. The source lives in `prototypes/devmentor-journey/`; Storybook
serves the built preview. Keep the scope of the user's epic or screen request.

## Establish the design contract

Read the repository's `AGENTS.md` and relevant entries in `.ai/lessons.md`, then:

- `packages/ui/.storybook/Guidelines.mdx` for the approved visual, content and
  accessibility rules.
- `packages/ui/.storybook/Handoff.mdx`, `E01Flow.mdx` and `E02Flow.mdx` for screen,
  state and component mappings. Read only the epic pages relevant to the request.
- `prototypes/devmentor-journey/README.md`, `main.tsx` and the affected screen
  modules for the current navigation, demo data and review controls.
- The active feature specification in `.ai/specs/` and its linked issue acceptance
  criteria. Check `.ai/specs/implemented/` before proposing a new specification.

For nontrivial work without an applicable specification, write one in
`.ai/specs/YYYY-MM-DD-slug.md` before implementation. Map each acceptance criterion
to its screen, role, initial state, outcome and recovery. Treat an available
component as one part of a finished screen, not evidence of a connected flow.

The user-approved design includes technology icons, mentor reviews and search.
Older no-review/no-search product text does not authorize removing them. Keep any
production policy difference explicit in the handoff. Connect's designed states
are included; its production integration remains iteration 1.1 unless the user
changes that scope.

## Extend the existing UI

Reuse `@devmentor/ui` and `@devmentor/ui/backend`. Inspect the existing component
and its stories before adding another. Reusable concept UI belongs in
`packages/ui/src/components/<concept>/`; generic panels belong in the designated
backend category. The UI package stays presentational and never imports core/db.
Add shadcn primitives through the repository's configured CLI when needed.

Keep styles on the shared tokens and existing responsive patterns. Follow the
current English UI copy and humanizer rules. Preserve the DM Mono wordmark,
Inter UI text, neutral fact chips, labelled technology icons, spacious panels,
and metadata without dot separators. Form footers put secondary before primary
and align right; authentication uses full-width actions and separate back links.
Check both themes and the complete screen at 320px as well as desktop.

Put demo state transitions in a testable prototype model. Screen components
compose that state with shared UI. Use the sanctioned `apiCall` layer for local
mock requests. Provider response previews must be labelled simulations, and
failure controls belong in the review toolbar rather than product navigation.
Never request real credentials, financial details or actual provider connections
for a prototype flow.

Use the same sample data for editing, public profiles, availability and booking.
Keep confirmed booking prices as snapshots. Scope private draft/account data to
its demo owner. Preserve inputs after failed requests and suppress protected
content before showing an access gate. Invitation acceptance adds the mentor
role to existing roles; general account registration does not grant that role.

## Preserve navigation and review comments

Screen IDs are permanent references. Keep existing IDs and append new IDs without
renumbering. Register new screens in `main.tsx`, its navigation/access model and
the handoff map. Preserve the review engine and the comment key
`om-prototype-comments:v2:devmentor-journey`.

Do not clear browser comments or replace a nonempty `comments.js` operation log.
Preserve operation IDs and deletion tombstones if combining reviewed exports.
Keep heading focus, browser/history navigation, form keyboard shortcuts and
back-navigation context working after a transition.

## Verify and hand off

Run from the repository root, using Node 24 or later:

```bash
npm run typecheck
npm run typecheck:storybook
npm run typecheck:prototype
npm run lint
npm run test:unit:coverage
npm run test:prototype
npm run build
npm run build-storybook
```

Every changed production UI file must be explicitly included in the repository's
coverage scope and reach 100% statements, branches, functions and lines. Add
prototype models to the prototype coverage scope and test their branches. Test
connected navigation, ownership, recovery and data propagation as behavior; do
not rely only on isolated component renders. Run the integration checks required
by `AGENTS.md` when a change crosses app, database or API boundaries.

`npm run storybook` rebuilds the prototype and starts the local catalogue. Reuse
an existing server when available. `npm run prototype` refreshes generated output
following source changes. Start at `/prototypes/devmentor-journey/index.html` and
walk the changed flow in the browser using the pinned local `agent-browser`:
success, empty/first-run state, permission denial, failed request and retry.
Review keyboard/focus, desktop and 320px mobile in light and dark themes. Close
only the isolated review session you created.

Update the epic's Storybook coverage page, `Handoff.mdx` and the prototype README
with exact screen links, component stories, source paths and simulation limits.
Report the checks actually run and any remaining gaps. Do not label a flow ready
for implementation until its full visual walkthrough and required checks pass.

Generated previews, screenshots, run records and local review drafts stay out of
commits. Source, tests, component documentation and this reusable workflow are
project deliverables. Work locally; a request to design or implement a prototype
does not authorize pushing, editing remote issues/PRs, publishing or messaging
reviewers. Follow the user's explicit authorization before each remote action.

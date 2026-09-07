# DevMentor prototype

A standalone React prototype using the shared `@devmentor/ui` components, tokens,
fonts and icons. Nineteen screens cover the homepage, mentor catalogue and
profiles, booking, mentee and mentor workspaces, text session, written answer,
private notes and mentor reviews.

## Run locally

Use Node 24 or later and install dependencies from the repository root. Run all
commands below from that root:

```bash
npm run prototype
npm run storybook
```

Open [the prototype](http://127.0.0.1:6006/prototypes/devmentor-journey/index.html).
If Storybook is already running, reuse it. After editing prototype source, run
`npm run prototype` again and refresh the page.

The build writes generated files to
`packages/ui/.storybook/public/prototypes/devmentor-journey/`. Source `tokens.css`
imports the shared design system and `theme-bridge.css` directly; the build does
not rewrite source files. Generated output is ignored by Git. The prototype needs
the HTTP server; opening source HTML with
`file://` will not load its modules, fonts and mock worker correctly.

## Walk through the prototype

Start at the homepage and choose **Find your mentor** to open the catalogue.
Search the six fictional mentors by name, technology or help topic. Combine a
technology, price and availability filter; sort by the next published time or
25-minute price. Applied filters can be removed separately or cleared together.
Each profile action opens details for that mentor. Closing the profile returns
focus to its card and keeps the current search and filters.

Alex Laurent's profile preview also opens his full profile. Choose a time and
session length, sign in, review the booking and select a demo payment result. Failure keeps the
selection, a conflict blocks the occupied time, and an expired hold clears the
selection. Standalone sign-in opens My sessions; signing in during booking returns
to the selected booking summary.

In the text session, Enter adds a line and Ctrl or Cmd + Enter sends. Successful
sends clear the composer and return focus to it; failed sends retain the draft.
Send or clear a draft before using **Preview session end** in the labelled demo
controls. A completed session exposes the written answer and mentor-review form.
The private-note flow supports requesting changes, revising a note and approving
the new version. Mentor settings change sample prices and available times.

The screen picker opens individual states directly. Back follows the screens
visited during this visit. Reload resets sample business data.

## Review tools

**Review tools** provides anchored comments, replies, resolution and re-anchoring.
**Presentation** switches between individual screens and the complete review
document. The theme control switches the whole prototype between light and dark.

Comments stay in the current browser under
`om-prototype-comments:v2:devmentor-journey`. The original screen IDs `s1` through
`s18` are unchanged; the homepage is `s17` and the catalogue is `s19`. Existing
comments may need **Re-anchor** after layout edits.
**Export Markdown** downloads a readable report. **Export for repository**
downloads the operation log; to include reviewed comments in a build, replace
`comments.js` with that export and rebuild. Preserve operation IDs and deletion
tombstones when combining exports. Exports do not publish comments or contact
other reviewers. The checked-in comment log starts empty.

## Simulation limits

- People, messages, ratings and records are fictional. Reviews update the sample
  profile during the current visit; they are not stored on a backend.
- The scenario clock is fixed at 10 September 2026, 08:00 UTC. Visitors can change
  timezone. Times less than two hours ahead cannot be selected.
- GitHub/email sign-in, payment outcomes, messages and form saves are simulated.
  The local mock worker handles `/prototype-api/devmentor-journey/save`. No real
  accounts, charges, message delivery or database writes are created.
- Alex's session prices start at PLN 180 for 25 minutes and PLN 320 for 50 minutes.
  Allowed ranges of PLN 90–600 and PLN 180–1,200 are sample operator settings.
- The catalogue filters fictional records in memory. It does not call a search
  service or save preferences across reloads. Every card has its own profile
  preview; only Alex has the full booking flow. His catalogue prices, reviews and
  times follow the current sample settings. The other five profiles have fixed
  sample biographies, rating summaries and availability.
- The final session channel and payout policy remain product decisions. The
  prototype does not implement a production mentor directory, public notes, payout
  processing, review moderation or authoritative review eligibility.
- Copy and sample data are in English. Production localization and service
  integrations are separate work.

## Check changes

```bash
npm run typecheck:prototype
npm run test:prototype
npm run prototype
```

Check affected screens at desktop and mobile widths in both themes. Verify the
related action, its error state and keyboard behavior. The repository's pinned
`agent-browser` is available for isolated browser checks.

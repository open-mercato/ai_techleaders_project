# DevMentor prototype

A standalone React prototype using the shared `@devmentor/ui` components, tokens,
fonts and icons. Twenty-five screens cover the homepage, mentor catalogue and profiles,
account registration and sign-in, role access, booking, mentee, mentor and operator
workspaces, text session, written answer, private notes and mentor reviews.

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
selection. Signing in during booking returns to the selected booking summary.

## Accounts and roles: E01

The connected account flow covers the UI in the Accounts and Roles specification
dated 4 September 2026, stories #12, #13 and #14. Start at sign-in (`s12`). GitHub
opens a labelled provider-response demo (`s23`); email registration (`s20`) leads
to check-inbox (`s21`) and verification (`s22`). Registration alone does not sign
the person in.

Choose **Auth scenarios** in the review toolbar to open **Authentication demo
controls**. Expand **Demo email accounts and password** for sample credentials.
**Next request result** selects one failed request; the next valid submission can
succeed. **Verification link** selects a valid, expired or invalid link. The
**Preview GitHub-only release** checkbox disables email sign-in and registration.
On `s23`, select the **GitHub demo account** and **GitHub response** separately.

Review incorrect credentials, account conflicts, unverified email, provider
cancellation, unavailable services, mail failure and cooldown feedback. Failed
forms retain their entries. Verification can succeed or be reused. For an expired
or invalid link, **Request a new verification link** returns to registration with
the email filled in. Enter the name and password again, submit, set the demo link
to **Valid** and open it from the inbox preview. Newly registered mentees see
**No sessions yet** in their workspace. Their private session screens remain empty
until they confirm a demo booking; the existing accounts use sample session data.

After sign-in, the default home follows operator (`s24`), mentor (`s11`), then
mentee (`s6`) priority. Navigation includes the account's combined roles.
Operators can open Users (`s25`). Use Taylor to check combined mentee/mentor
navigation, or Sam for mentor/operator navigation. **Remove Sam's operator
access** removes operator pages while preserving the mentor role; **Restore Sam's
operator access** makes them available again. Use the screen picker to attempt
**Operator users** while access is removed. **Expire demo session** ends the
current session. Denied screens withhold their content and offer sign-in or a permitted destination.
These controls are review tools, not product actions for granting roles.

Signing in during booking preserves the selected time and length. Standalone
sign-in uses the role home, and visiting sign-in while already signed in returns
there too. Sign-out from a workspace returns to the homepage.
See [the E01 coverage map](http://127.0.0.1:6006/?path=/docs/design-system-e01-accounts-and-roles--docs)
for component coverage and the remaining production work.

## Session and note flows

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
comments may need **Re-anchor** after layout edits. The account and operator
screens use the additional IDs `s20` through `s25`.
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
- GitHub/email sign-in, registration, verification, role access, payment outcomes,
  messages and form saves are simulated.
  The local mock worker handles `/prototype-api/devmentor-journey/save` and the
  `/prototype-api/devmentor-journey/auth/*` demo endpoints. No real
  accounts, charges, message delivery or database writes are created.
- Account state lasts for the current visit. Failure scenarios affect one request;
  the rate-limit example does not run a real cooldown. Replacing a verification
  link repeats registration for the pending email address. Demo links, sessions and
  role checks are not production security. Real OAuth, password hashing, email
  delivery, cookies, rate limiting, persistent storage and live server-side
  authorization still need implementation. Password reset and invitation
  acceptance are outside this E01 flow.
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

The prototype test command also enforces 100% per-file coverage for its
authentication model and mock API runtime. Reports stay in `coverage/prototype`.

Check affected screens at desktop and mobile widths in both themes. Verify the
related action, its error state and keyboard behavior. The repository's pinned
`agent-browser` is available for isolated browser checks.

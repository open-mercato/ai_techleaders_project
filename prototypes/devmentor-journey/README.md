# DevMentor prototype

A standalone React prototype using the shared `@devmentor/ui` components, tokens,
fonts and icons. Its 29 screens cover the homepage, mentor catalogue and profiles, account
registration and sign-in, role access, mentor invitation and setup, booking,
mentee, mentor and operator workspaces, text session, written answer, private
notes and mentor reviews.

For implementation, start at the
[E01/E02 handoff](http://127.0.0.1:6006/?path=/docs/design-system-implementation-handoff--docs).
It maps all eight stories to composed screens, states, components and source.
Use [E01 sign-in](http://127.0.0.1:6006/prototypes/devmentor-journey/index.html#s12)
or [E02 invitation](http://127.0.0.1:6006/prototypes/devmentor-journey/index.html#s26)
to walk a complete journey. These localhost links require a running copy on the
reader's computer; they are not shared deployments.

The [UI/prototype specification](../../.ai/specs/2026-09-09-e02-design-handoff.md)
defines the E01/E02 screen handoff. The
[E01 production specification](../../.ai/specs/2026-09-04-accounts-and-roles.md)
defines the account implementation. The E02 production specifications are also
in the repository. Use the [E02 architecture and shared contracts](../../.ai/specs/2026-09-08-mentors-become-bookable.md)
with the relevant story specification:

- [Invitations](../../.ai/specs/2026-09-08-invitations.md)
- [Mentor page](../../.ai/specs/2026-09-08-mentor-page.md)
- [Availability](../../.ai/specs/2026-09-08-availability-slots.md)
- [Prices](../../.ai/specs/2026-09-08-mentor-prices.md)
- [Stripe Connect, iteration 1.1](../../.ai/specs/2026-09-08-stripe-connect-onboarding.md)

These specifications define production behavior; the prototype simulates it for
UI review and does not implement the backend.

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
Operators can open Users (`s25`). On compact screens, **Menu** opens the permitted
workspace navigation. Use Taylor to check combined mentee/mentor
navigation, or Sam for mentor/operator navigation. **Remove Sam's operator
access** removes operator pages while preserving the mentor role; **Restore Sam's
operator access** makes them available again. Use the screen picker to attempt
**Operator users** while access is removed. **Expire demo session** ends the
current session. Denied screens withhold their content and offer sign-in or a permitted destination.
These controls are review tools, not product actions for granting roles.

Signing in during booking preserves the selected time and length. Standalone
sign-in uses the role home, and visiting sign-in while already signed in returns
there too. Sign-in from an invitation returns to that invitation. Sign-out from a
workspace returns to the homepage.
See [the E01 coverage map](http://127.0.0.1:6006/?path=/docs/design-system-e01-accounts-and-roles--docs)
for component coverage and the remaining production work.

## Mentor setup: E02

Start at the received invitation (`s26`) while signed out. Sign in or register
and verify an email account, return to the invitation, then accept it. Acceptance
adds the mentor role without replacing existing roles. The mentor workspace
(`s11`) shows a checklist and a deadline 14 days after acceptance for completing
the profile, setting both prices and publishing a first bookable time.

Open the profile editor (`s27`), enter the required public-work URL, description
and stack tags, then save and publish. The public page (`s1`) shows the saved
content. Copy its share link from the profile editor; the failure state keeps a
manual-copy option. A local preview link uses the current browser visit's sample
data; a fresh visit resets those records.
Set prices for both 25- and 50-minute sessions and publish future times from the
mentor workspace. Free times can be removed; booked times keep their booking and
explain where to review cancellation.

The public profile and booking selection use the same published mentor data.
Missing prices block booking. Successful changes affect new selections;
confirmed bookings retain their recorded price. Mentor draft and setup data are
scoped to the current sample account.

Payout settings (`s28`) lead to the labelled Stripe response preview (`s29`).
Return incomplete, pending, enabled or restricted to review each status and its
next action. Cancel and request-failure states offer another attempt. No real
financial details are requested and Stripe is never contacted. Production
Connect remains iteration 1.1 and is separate from the first-iteration checklist.
Operators can read mentor status in the **Payout setup** column on Users (`s25`):
Not set up, Under review, Enabled or Needs attention. Other accounts show Not a
mentor. The operator view has no payout-editing action; mentors manage their own
setup on s28.

Choose **Mentor scenarios** to open **Mentor demo controls**. **Invitation link**
selects Valid, Expired, Unknown or Already used; **Open invitation** opens s26.
**Fail the next mentor request** affects one request. On s29, **Return status**
selects the Connect outcome and **Return to DevMentor** applies it. Use
**Refresh payout status** on s28 to review request failure and retry. Use the
[E02 coverage map](http://127.0.0.1:6006/?path=/docs/design-system-e02-mentors-become-bookable--docs)
for each story's success, first-use, validation, permission and recovery paths.

## Screens and source

Screen IDs remain stable so that review comments and links keep their meaning.

| Story or area | Screens | Source |
| --- | --- | --- |
| E01 #12 GitHub sign-in | s12 sign-in, s23 GitHub response | [AuthScreens.tsx](AuthScreens.tsx), [auth-model.ts](auth-model.ts), [auth-runtime.ts](auth-runtime.ts) |
| E01 #13 Email/password | s20 registration, s21 inbox, s22 verification, s12 sign-in | [AuthScreens.tsx](AuthScreens.tsx), [auth-context.tsx](auth-context.tsx) |
| E01 #14 Role access | s6 mentee home, s11 mentor home, s24 operator home, s25 users, s16 no access | [Frame.tsx](Frame.tsx), [AuthScreens.tsx](AuthScreens.tsx), [auth-context.tsx](auth-context.tsx) |
| E02 #15 Invitation | s26 invitation, E01 sign-in/verification, s11 first mentor home | [MentorScreens.tsx](MentorScreens.tsx), [mentor-model.ts](mentor-model.ts), [mentor-runtime.ts](mentor-runtime.ts), [auth-context.tsx](auth-context.tsx) |
| E02 #16 Profile | s27 edit/publish/share, s11 workspace, s1 public profile | [MentorScreens.tsx](MentorScreens.tsx), [MentorProfileScreen.tsx](MentorProfileScreen.tsx) |
| E02 #17 Availability | s11 manage times, s3 public selection, s2 no available times | [MentorScreens.tsx](MentorScreens.tsx), [BookingScreens.tsx](BookingScreens.tsx), [mentor-model.ts](mentor-model.ts) |
| E02 #18 Prices | s11 prices, s1 public profile, s3 selection, s4 booking summary | [MentorScreens.tsx](MentorScreens.tsx), [BookingScreens.tsx](BookingScreens.tsx), [main.tsx](main.tsx) |
| E02 #19 Connect | s28 mentor payout settings, s29 Stripe response preview, s25 read-only operator status | [MentorScreens.tsx](MentorScreens.tsx), [AuthScreens.tsx](AuthScreens.tsx), [mentor-model.ts](mentor-model.ts) |
| Discovery | s17 homepage, s19 mentor catalogue | [LandingScreen.tsx](LandingScreen.tsx), [MentorCatalogueScreen.tsx](MentorCatalogueScreen.tsx), [mentors.ts](mentors.ts) |
| Booking results | s14 demo checkout, s5 payment recovery, s13 conflict/expiry | [BookingScreens.tsx](BookingScreens.tsx), [flow.ts](flow.ts) |
| Sessions and feedback | s7 text session, s8 answer, s9 note review, s10 request changes, s15 approved note, s18 mentor review | [SessionScreens.tsx](SessionScreens.tsx), [reviews.ts](reviews.ts) |

Reusable account components live in
[`packages/ui/src/components/auth/`](../../packages/ui/src/components/auth/);
mentor components in
[`packages/ui/src/components/mentors/`](../../packages/ui/src/components/mentors/);
forms, tables and layout patterns in
[`packages/ui/src/backend/`](../../packages/ui/src/backend/).
Component styling follows
[the shared usage rules](../../packages/ui/.storybook/Guidelines.mdx).

The maintained workflow for further epic designs is
[`$devmentor-prototype`](../../.agents/skills/devmentor-prototype/SKILL.md).
Use it to extend this source and update the story/state map as screens change.

## Session and note flows

In the text session, Enter adds a line and Ctrl or Cmd + Enter sends. Successful
sends clear the composer and return focus to it; failed sends retain the draft.
Send or clear a draft before using **Preview session end** in the labelled demo
controls. A completed session exposes the written answer and mentor-review form.
The private-note flow supports requesting changes, revising a note and approving
the new version.

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
Mentor invitation, profile editing and payout screens use `s26` through `s29`.
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
- GitHub/email sign-in, registration, verification, invitation acceptance, role
  access, mentor setup, Connect, payment outcomes, messages and form saves are
  simulated.
  The local mock worker handles `/prototype-api/devmentor-journey/save`,
  `/prototype-api/devmentor-journey/auth/*` and
  `/prototype-api/devmentor-journey/mentor/*`. No real
  accounts, charges, message delivery or database writes are created.
- Account state lasts for the current visit. Failure scenarios affect one request;
  the rate-limit example does not run a real cooldown. Replacing a verification
  link repeats registration for the pending email address. Demo links, sessions and
  role checks are not production security. Real OAuth, password hashing, email
  delivery, cookies, rate limiting, persistent storage and live server-side
  authorization still need implementation. Password reset is outside E01;
  invitation acceptance is demonstrated in E02, with real invitation delivery,
  token validation and account binding left to the application.
- Alex's session prices start at PLN 180 for 25 minutes and PLN 320 for 50 minutes.
  Allowed ranges of PLN 90–600 and PLN 180–1,200 are sample operator settings.
- The catalogue filters fictional records in memory. It does not call a search
  service or save preferences across reloads. Every card has its own profile
  preview. Among the six catalogue records, Alex has the full booking flow. His
  catalogue prices, reviews and times follow the current sample settings. The
  other five profiles have fixed sample biographies, rating summaries and
  availability. Newly published mentor profiles can be opened and booked from
  the mentor workspace; they are not added to the six-record search fixture.
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

The prototype test command enforces 100% per-file coverage for its account and
mentor models and their mock API runtimes. Reports stay in
`coverage/prototype`. For shared UI changes, also run
`npm run test:unit:coverage`; add each changed production file to the explicit
coverage scope as required by `AGENTS.md`.

Check affected screens at desktop and mobile widths in both themes. Verify the
related action, its error state and keyboard behavior. The repository's pinned
`agent-browser` is available for isolated browser checks.

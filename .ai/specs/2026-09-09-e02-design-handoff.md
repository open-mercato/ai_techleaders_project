# E01 and E02 design handoff

Status: active UI/prototype specification, 2026-09-09.

## Problem and goal

The team needs finished UI for implementing E01 and E02. E01 has a connected
account prototype; E02 has disconnected examples and incomplete profile,
invitation, availability and payout flows. Complete the UI in the current
DevMentor design system and provide an exact story-to-screen-to-source map.

## Scope

E01 #12–14: audit and retain email/GitHub sign-in, registration and verification,
role homes, additive role navigation, expiry, sign-out, denial and operator users.
E02 #15–19: invitation entry and acceptance with login continuation, expired/used/
unknown invitation states, first mentor home with a 14-day publication deadline,
profile editing and publishing with required work URL/description/stack tags,
share link with copy feedback, prices and missing-price bookability, availability
creation/removal/booked refusal, Stripe Connect start/return/status/recovery demo.

Use #15–19 acceptance criteria read from GitHub on 2026-09-08. Reviews and search
remain in the design as explicitly requested by the user. Their production
policies require the accepted product specification to record that change;
the design work does not update remote issues or implement those services.

## Approach

- Keep existing prototype screen IDs s1–s25 and comment storage unchanged. Add
  s26 invitation, s27 mentor profile editor, s28 payouts, s29 Stripe response
  preview. Use s11 for the complete mentor home, rates and availability.
- Reuse @devmentor/ui and its form/feedback/shell primitives. Add reusable mentor
  profile and onboarding components with Storybook states and 100% unit coverage.
- Keep demo business transitions in a testable mentor model. Profile, prices,
  slots and payout state are scoped to the sample mentor account; invitation
  acceptance adds a mentor role without losing other roles. Public preview and
  booking consume the same published data; confirmed prices remain snapshots.
- Expose controlled failure scenarios separately from the product UI. Failed
  requests retain inputs and offer retry. The Stripe preview never requests real
  financial data or contacts Stripe.
- Add a Storybook handoff page and source README with runnable links, route/state
  coverage, component names, implementation boundaries and review instructions.
- Prepare a shared DevMentor prototype skill that points to the real components,
  local commands and approved design rules rather than Open Mercato paths.

## Non-goals

No production OAuth, email, invitation service, database persistence, payments,
Stripe integration or remote publication. This is a concrete design contract and
clickable demo for subsequent implementation. Stripe Connect remains iteration
1.1 in production; its designed states are included in this handoff.

## Acceptance criteria

1. Every E01/E02 story has named screens and states linked from one handoff page.
2. An invited user can sign in, return to the invitation, accept once, see the
   mentor home and deadline, complete/publish a profile, set prices and publish a
   time. Invalid/expired/used invitations cannot grant another role.
3. Required profile validation, save failure, unpublished page, copy-link success
   and clipboard failure have usable feedback. Published profile reflects saved
   content and retains the requested review components.
4. Both price bounds validate. Missing prices prevent booking. Existing confirmed
   bookings retain their price. Available times can be removed; booked times
   refuse removal and explain the cancellation route.
5. All four Connect states and request failure/recovery are reachable through a
   connected, clearly simulated flow; payout data stays on authorized screens.
6. Forms use right-aligned secondary then primary actions. Authentication keeps
   full-width actions. Technology icons, chips, no dot separators, spacing,
   typography, English humanized copy and both themes follow DS guidelines.
7. Desktop and 320px mobile browser walkthroughs cover main paths, failure
   recovery and keyboard/focus. No clipped controls or document overflow.
8. Unit coverage, prototype regressions, typechecks, lint and builds pass. Each
   new/changed production UI file is explicitly included in coverage. New mentor
   model behavior has 100% coverage and connected screens have regression tests.

## Implementation sequence

1. Add shared mentor UI components/stories and a pure mentor demo model/tests.
2. Connect screens, auth continuation and shared public/booking data.
3. Publish local handoff documentation and reusable workflow; audit E01 coverage.
4. Run checks, inspect desktop/mobile/light/dark and fix discovered defects.

Generated previews, audit records and screenshots stay local. Source, required
tests, component documentation and reusable workflow are intended deliverables.
Remote publication requires a separate explicit instruction.

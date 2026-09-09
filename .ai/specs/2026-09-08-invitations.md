# DevMentor — E02-S01: Invitations and the mentor role grant

Date: 2026-09-08
Status: active
Issue: [#15](https://github.com/open-mercato/ai_techleaders_project/issues/15) (epic #8)
Depends on: E01 Slices 1, 2 and 4 (the test toolchain, the session mechanism, shadcn `input`) — see the
epic spec's prerequisite table; the issue names E01-S01 (#12), which covers only the session half
Design authority for architecture, data model and contracts:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 1). The B5′, F8, F9 and T1 entries in
`.ai/specs/2026-09-08-platform-primitives-ii.md` are catalogue pointers, not a second authority.

This is a **thin story spec**. It owns the user-visible behaviour, the screens and the acceptance
criteria. It does not restate the `Invitation` table, the service signatures, the route table or the
implementation steps — those are in the epic spec's Data Model, API Contracts and Slice 1 plan, and
duplicating them here is how the two documents would drift.

## 📝 TLDR

An operator invites a senior engineer from the beachhead pool by hand (R18). The engineer opens a
single-use link, signs in, accepts, and their account gains the `mentor` role without losing any role
it already held. The mentor home then states the one thing D18 measures: publish at least one bookable
session by a date, shown explicitly.

## 📝 Problem Statement

D08/R07 make invitation the only way to become a mentor — there is no open registration, and #14 makes
its absence an acceptance criterion in the negative. D18 makes the invitation itself the test of A03:
batches of 20, at least one bookable session within two weeks of accepting, and fewer than 5 of the
first 20 stops further invitations. Nothing in the repository represents an invitation, and
`MentorProfile` exists only as a placeholder attached to one seeded user.

Until this story ships, no other E02 story has a mentor to act as.

## 📝 Scope

**In:** the `Invitation` record with a normalized email; a link whose raw token exists only in the
link; acceptance that reloads the user, requires their persisted normalized email to be verified and
equal to the invitation email, grants `mentor` exactly once inside a transaction, **re-issues the
caller's session cookie** (because `grantRole` bumps `session_version`) and creates the empty
`MentorProfile` row E02-S02 later fills. The first acceptance copies the snapshotted deadline to
`MentorProfile.initialPublishDueAt`; later invitations never reset it. `revoke` and token-rotating
`resend` apply only while an invitation is pending and lock against acceptance. At most one unresolved
invitation may exist per normalized email. Also in: the by-hand `invite create|revoke|resend` script
(R18), the mentor home's publish-by ask and the owner-scoped onboarding-status read that survives
redirect/refresh.

**Out:** batches of 20 and the two-week report (#30 — until then the operator counts from
`publish_due_at` by hand); the mentor page fields (#16); a real mail transport (E01's log mailer is
enough until the October batch, D16); any operator screen.

## 📝 UI/UX

**`/invitation/[token]`** — public, Tailwind.

- *Signed out:* the invited address, the stack tags it carries, and "Sign in with GitHub" first, email
  second (D07), returning to this same URL.
- *Signed in with the matching verified email:* the account name it will grant the role to, then
  "Accept invitation", then a redirect to `/mentor`.
- *Signed in with another email:* both addresses, a sign-out/sign-in instruction, and no Accept button.
- *Invalid:* one sentence, no form. Unknown, expired, revoked and consumed links read identically; the
  caller's current role is not used to reveal whether a token was once valid.

**`/mentor`** — app surface. Slice 1 reads `GET /api/mentors/me/onboarding` and renders *"Publish at
least one bookable session by <date>"* through `LocalTime`, so the deadline survives a redirect or
refresh. Slice 2 replaces the plain status with `ReadinessChecklist`; after Slices 2–4 its per-item
actions link to the page, prices and slots screens.

## ✅ Acceptance criteria

- Given an invitation created by the operator for an engineer from the beachhead pool, When the
  engineer signs in with the matching verified email and explicitly accepts, Then their account holds
  the `mentor` role and the invitation is marked accepted with the date. (R07, R16, D18)
- Given an accepted invitation, When the mentor first lands on the mentor home, Then it states the ask
  — publish at least one bookable session within two weeks of accepting — with that date shown. (R17)
- Given a link that was already used, When it is opened again, Then it does not grant the role a second
  time. (negative)
- Given an expired, revoked or unknown link, When it is opened, Then no mentor account is created and
  the screen says the invitation is not valid. (negative)
- Given a signed-in user with no invitation, When they look for a "become a mentor" path, Then there is
  none. (R07, negative — asserted with `expectAbsent`)
- Given a user who already holds `mentee`, When they accept, Then they hold both `mentee` and `mentor`.
- Given a signed-in user whose persisted verified normalized email does not match the invitation,
  When they view or submit it, Then no Accept button is shown, POST returns `403`, and no role, profile,
  accepted timestamp or new session is created.
- Given an unverified account, When it submits an invitation, Then acceptance is refused identically.
- Given two tabs accepting the same invitation at once, When both submit, Then one succeeds and one is
  refused, and the role is granted once.
- Given two create commands for the same normalized email, When they race, Then one unresolved
  invitation exists; an expired unresolved row must be resent or revoked rather than duplicated.
- Given the normalized email belongs to a user who currently holds `mentor`, When an operator creates
  another invitation, Then creation is refused so one mentor is not counted in a second active batch.
- Given acceptance racing revoke or resend, When both run, Then their invitation-row lock gives one
  winner and the loser observes the committed state without partially granting or rotating anything.
- Given a successful acceptance, When the mentor lands on `/mentor`, Then they are **still signed in** —
  the response re-issued their session cookie. (regression: `grantRole` bumps `session_version`)

## 📝 Edge cases

Owned by the epic spec's Edge Cases table. A pending invitation can be revoked or resent; resend rotates
the token hash and expiry atomically so the old link stops working. An accepted invitation cannot be
revoked as a proxy for role removal. Emergency removal uses the separately audited `revokeRole`
operation, because invitation state alone cannot prove that a mentor role is safe to remove.

Acceptance locks the persisted user before the invitation and profile so separate historical tokens
for one account cannot race profile creation or reset the first deadline. The operator script is the
production caller for create, revoke and resend and emits a token-free audit line for the shared note.

## 📝 Risks

`risk-high` — this is the only self-service role grant in the product, and R07 forbids any other.
`needs-qa`, second reviewer. Compatibility: a new table (`up` and `down`, §3), a new event (§6,
additive), a new `invite` npm script (§5, additive, listed in `README.md`). Every changed production
file, including pages and `scripts/invite.ts`, is explicitly included in the 100%-coverage gate.

## 📝 Decisions in play

D08/R07, D18/R17, D24/R16, D19/R18.

## 📝 Open questions

- **Invitation validity period** (owner: founder A) — provisionally 14 days via
  `INVITATION_TTL_DAYS`, snapshotted per invitation so changing the default never expires a link
  already in an inbox. Non-blocking; founder A may select another value before Slice 1 starts without
  changing the mechanism.

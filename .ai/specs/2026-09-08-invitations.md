# DevMentor — E02-S01: Invitations and the mentor role grant

Date: 2026-09-08
Status: active
Issue: [#15](https://github.com/open-mercato/ai_techleaders_project/issues/15) (epic #8)
Depends on: E01 Slices 1, 2 and 4 (the test toolchain, the session mechanism, shadcn `input`) — see the
epic spec's prerequisite table; the issue names E01-S01 (#12), which covers only the session half
Design authority for architecture, data model and contracts:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 1) and
`.ai/specs/2026-09-08-platform-primitives-ii.md` (B5′, F8, F9, T1)

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

**In:** the `Invitation` record; a link whose raw token exists only in the link; acceptance that grants
`mentor` exactly once inside a transaction, **re-issues the caller's session cookie** (because
`grantRole` bumps `session_version`) and creates the empty `MentorProfile` row E02-S02 later fills; `revoke` and `resend` for the operator's inevitable typo;
the by-hand `invite` script (R18); the mentor home's publish-by ask.

**Out:** batches of 20 and the two-week report (#30 — until then the operator counts from
`publish_due_at` by hand); the mentor page fields (#16); a real mail transport (E01's log mailer is
enough until the October batch, D16); any operator screen.

## 📝 UI/UX

**`/invitation/[token]`** — public, Tailwind.

- *Signed out:* the invited address, the stack tags it carries, and "Sign in with GitHub" first, email
  second (D07), returning to this same URL.
- *Signed in:* **the account name it will grant the role to**, stated before the button — accepting on
  the wrong account is the realistic mistake — then "Accept invitation", then a redirect to `/mentor`.
- *Invalid:* one sentence, no form. Unknown, expired and revoked read identically (see the epic's API
  Contracts for why). An invitation **the caller themselves already accepted** is the one exception:
  they get "you already accepted this" rather than a uniform 404, because they can already see their
  own mentor role.

**`/mentor`** — app surface. A `ReadinessChecklist` (F9) titled *"Publish at least one bookable session
by <date>"*, the date rendered through `LocalTime` (F8) in the mentor's own timezone. Each unmet item
links to the screen that fixes it. After Slices 2–4 the items are the page, the prices and one future
slot; in Slice 1 the list is the ask alone.

## ✅ Acceptance criteria

- Given an invitation created by the operator for an engineer from the beachhead pool, When the
  engineer opens the link and signs in, Then their account holds the `mentor` role and the invitation
  is marked accepted with the date. (R07, R16, D18)
- Given an accepted invitation, When the mentor first lands on the mentor home, Then it states the ask
  — publish at least one bookable session within two weeks of accepting — with that date shown. (R17)
- Given a link that was already used, When it is opened again, Then it does not grant the role a second
  time. (negative)
- Given an expired, revoked or unknown link, When it is opened, Then no mentor account is created and
  the screen says the invitation is not valid. (negative)
- Given a signed-in user with no invitation, When they look for a "become a mentor" path, Then there is
  none. (R07, negative — asserted with `expectAbsent`)
- Given a user who already holds `mentee`, When they accept, Then they hold both `mentee` and `mentor`.
- Given two tabs accepting the same invitation at once, When both submit, Then one succeeds and one is
  refused, and the role is granted once.
- Given a successful acceptance, When the mentor lands on `/mentor`, Then they are **still signed in** —
  the response re-issued their session cookie. (regression: `grantRole` bumps `session_version`)

## 📝 Edge cases

Owned by the epic spec's Edge Cases table (rows 1–5). The one worth restating because it is a product
choice rather than a mechanism: an invitation opened while signed in as a *different* account grants
the role to **that** account. The page names the account before the button, and the operator's remedy
is `revoke` + `resend`.

## 📝 Risks

`risk-high` — this is the only self-service role grant in the product, and R07 forbids any other.
`needs-qa`, second reviewer. Compatibility: a new table (`up` and `down`, §3), a new event (§6,
additive), a new `invite` npm script (§5, additive, listed in `README.md`).

## 📝 Decisions in play

D08/R07, D18/R17, D24/R16, D19/R18.

## 📝 Open questions

- **Invitation validity period** — resolved in the epic spec: 14 days via `INVITATION_TTL_DAYS`,
  snapshotted per invitation so changing the default never expires a link already in an inbox.
  Founder A may set a different number without any code change.

# DevMentor — E02-S02: The mentor page and its share link

Date: 2026-09-08
Status: active
Issue: [#16](https://github.com/open-mercato/ai_techleaders_project/issues/16) (epic #8)
Depends on: E02-S01 (#15); E01 Slices 1, 2 and 4
Design authority for architecture, data model and contracts:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 2) and
`.ai/specs/2026-09-08-platform-primitives-ii.md` (B21′, B22, B23, B24, B25, B26, F5′, F10, T1)

A **thin story spec** — behaviour, screens and acceptance criteria only.

## 📝 TLDR

A mentor fills in a link to their public work, a plain description and up to four stack tags, publishes
the page when it is complete, and gets a stable share link that a signed-out visitor can open. There is
no rating, no score and no review anywhere on it.

## 📝 Problem Statement

The mentor interviewed on 2026-08-22 said *"my GitHub is my profile"*. N02 replaces scores with a link
to public work and a plain description (R04), and D21 makes the share link how mentors bring their own
audience. `MentorProfile` today holds only placeholder fields.

This is also the slice where the domain floor lands — it is the first consumer of four archetypes at
once (owner-scoped singleton, public read model, controlled vocabulary, readiness gate), which is why
it is the heaviest slice in the epic despite being a small feature.

## 📝 Scope

**In:** the real profile fields; the four-tag vocabulary (R16, D21); the publish gate that names what
is missing; a slug and the `/m/<slug>` public page; the share link with a copy button.

**Out:** slots (#17) and prices (#18), which the page renders once they exist; the mentor list (#20);
any rating, review or ranking (N02); slug redirect aliases.

## 📝 UI/UX

**`/mentor/profile`** — app surface, calling `requirePageRole('mentor')` itself. `CrudForm` bound to
`mentorProfileUpdateSchema` — whose fields are **all optional**, so a mentor can save a half-finished
page and completeness is judged only at publish — with the `multiselect` field for exactly four tag
options. Below it, the unmet readiness items, then the publish
action. A refused publish returns `fieldErrors` keyed to the same field names, so the message lands
next to the input rather than in a banner.

The share link is shown as text plus a copy button, in the form `${APP_URL}/m/<slug>`, with one line
saying the slug will not change if the mentor renames themselves. That sentence is the UI half of the
immutability rule; without it, a mentor reasonably assumes the link tracks their name.

**`/m/[slug]`** — public, Tailwind, rendered from `components/mentors/MentorPageView.tsx` so the mentor's
own preview and the public page cannot drift. Link to public work, description, tag badges, and — once
Slices 3 and 4 land — prices and bookable slots. Unpublished slugs 404.

**No score, review, rating or ranking appears in the markup.** This is asserted negatively in the
integration test with `expectAbsent`, not merely omitted.

## ✅ Acceptance criteria

- Given a mentor, When they save a link to public work and a plain description of what they have done,
  Then the mentor page shows both. (R04)
- Given a mentor choosing stack tags, When the choice is offered, Then it is limited to TypeScript,
  React, Python and AI agents. (R16, D21)
- Given any mentor page, When anyone opens it, Then it shows no rating, score, review or ranking.
  (N02, negative)
- Given a mentor page, When the mentor copies the share link and a signed-out visitor opens it, Then
  the visitor sees the page. Prices and slots appear on it as Slices 3 and 4 land; the issue's wording
  assumes all three shipped together. (D21, staged)
- Given a mentor with no public-work link, When they try to publish, Then it is not published and the
  missing link is named on the field. (R04, negative)
- Given a mentor who changes their display name after publishing, When a previously shared link is
  opened, Then it still resolves to their page. (slug immutability)
- Given two mentors with the same display name, When both pages are published, Then both have distinct,
  non-reserved slugs.
- Given the public page, When it is fetched, Then its payload contains no email, Stripe account id,
  payout field, invitation or publish deadline. (data scoping — asserted by a key-equality test)

## 📝 Risks

`risk-high` — a schema migration and a new public contract surface, which `SDLC.md:97` grades
`risk-high` regardless of feature size. `needs-qa`, second reviewer. Compatibility: additive columns
(§3, `up` and `down`); `slug` reaches `not null` inside the same migration; a new public route (§1,
additive); two `packages/ui/package.json` export-map entries (§2, additive); `headline` is kept so the
seeder and `admin.integration.test.ts` keep passing.

## 📝 Decisions in play

N02/R04, D21/R13, D24/R16.

## 📝 Open questions

- **`headline`, `bio`, `yearsOfExperience`** — resolved in the epic spec: kept. Retiring them is a
  separate expand-then-contract PR with no product value here.

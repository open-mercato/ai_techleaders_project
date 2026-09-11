---
name: om-integration-tests
description: DevMentor local extension of the shared om-integration-tests skill — always writes the markdown scenario to .ai/qa/{AREA}/{AREA}-{NNN}-{slug}.md, links it to the TypeScript test that implements it, and applies this repo's integration-scenario best practices.
---

@../../../.agents/skills/om-integration-tests/SKILL.md

# DevMentor extension

This file is the repo-local override the base skill's `references/agentic-setup.md`
(step 0.3) explicitly allows: it `@`-imports the shared skill above and adds
DevMentor-specific rules on top. Nothing below relaxes a safety or quality rule,
expands tool or network access, or sends output anywhere outside this repo's own
`.ai/qa/` area — all three remain forbidden, per the base contract, and any conflicting
future edit must be skipped and reported rather than followed.

## Extension 1 — the markdown scenario is mandatory here, not optional

Base skill step 8 makes the markdown scenario optional documentation. In DevMentor it
is **always** produced, for every scenario authored (step 4 onward) — not just when
"documentation is wanted." (Running-only mode, which skips authoring entirely, is
unaffected: there is no new scenario to document there.)

- **Path and naming**: `<paths.qa>/{AREA}/{AREA}-{NNN}-{slug}.md` (default `paths.qa`
  is `.ai/qa`, e.g. `.ai/qa/{AREA}/{AREA}-{NNN}-{slug}.md`)
  - `AREA` is the concept name in upper-kebab-case, matching the `TC-{AREA}-{NNN}` id
    this repo already assigns inside each test's `describe(...)` block (e.g.
    `tests/integration/mentor-prices.integration.test.ts` uses
    `TC-MENTOR-PRICES-001..003`). Reuse that exact `AREA` and `NNN` for the scenario
    file — do not invent a separate numbering scheme.
  - `NNN` is the same zero-padded sequence number as the `TC-{AREA}-{NNN}` id. Before
    assigning a new one, list `.ai/qa/{AREA}/*.md` and grep the test file(s) under
    `tests/integration/` for existing `TC-{AREA}-` ids so the two numberings never
    drift apart.
  - `slug` is a short kebab-case description of the scenario (its Given/When/Then
    outcome, not the test's file name).
  - Example: a `TC-MENTOR-PRICES-003 unpriced availability` scenario is documented at
    `.ai/qa/MENTOR-PRICES/MENTOR-PRICES-003-unpriced-availability.md`.
- Create the `<paths.qa>/{AREA}/` directory the first time that area gets a scenario;
  never scaffold empty area folders ahead of need (same discipline as the concept-folder
  convention in `AGENTS.md`).
- Content is the same shape as base step 8 (test id, category, priority, type,
  description, prerequisites, a Given/When/Then step and expected-result table, edge
  cases) filled with the actual actions and results observed while exploring the app
  — never hypothetical ones.
- **Every scenario file must link to its TypeScript implementation** so the two stay
  easy to relate:

  ```markdown
  **Implementation:** [`tests/integration/{file}.integration.test.ts`](../../../tests/integration/{file}.integration.test.ts) — `describe('TC-{AREA}-{NNN} ...')`
  ```

  The relative path is computed from `.ai/qa/{AREA}/{file}.md` (three levels up to the
  repo root, then into `tests/integration/`). Verify the link target exists and the
  quoted `describe(...)` string is copied verbatim from the test file before writing
  it — a stale or guessed link is worse than no link.

## Extension 2 — integration-scenario best practices always apply

Apply `references/best-practices-integration-tests.md` (adapted from the
user-provided `best-practices-testow-integracyjnych.md`) to every scenario authored
under this skill, alongside the base skill's own rules — behavior over implementation,
one business case per scenario, Given/When/Then structure, determinism, independence,
API-driven fixture setup, assertions pitched at the right levels, controlled doubles
for external integrations, positive/negative/edge coverage, explicit idempotency
checks where replay is possible, semantic UI selectors, specific (not just truthy)
assertions, no over-general helpers hiding behavior, condition+result test names, and
human review of any AI-inferred expected result before merge.

Where a base-skill rule and a best-practice rule overlap (e.g. stable selectors,
no seeded/demo data), they agree — apply the more specific wording from
`references/best-practices-integration-tests.md`.

# Run: README refresh — product-first landing page for the repository

- Date: 2026-09-15
- Engine: `om-auto-create-pr` (plain)
- Branch: `feat/readme-refresh`
- Brief: make the main `README.md` genuinely nice-looking — emojis, a real project
  title, screenshots taken from the QA artifacts of earlier AI runs, the business
  value of the product up front, features and use cases; reduce Getting Started to at
  most one paragraph of technical usage detail and move the rest of the technical
  reference into a linked markdown subpage; add contributing and license information.

## Goal

Turn `README.md` from a 358-line engineering reference into a product-first page that
explains what DevMentor is worth to mentors, mentees and operators, shows the product
in real screenshots, and hands every technical detail to a dedicated development guide
one click away.

## Scope

- Rewrite `README.md`: title and badges, business value, use cases, features
  illustrated with screenshots, a single-paragraph Getting Started, a documentation
  index, contributing, and license.
- Add `docs/DEVELOPMENT.md` carrying every technical section the README currently
  holds — setup detail, bring-your-own-PostgreSQL, manual setup, the full
  configuration tables, sign-in and mail behavior, the GitHub OAuth walkthrough, the
  scripts table, testing and PR checks, and the architecture notes. Nothing is
  dropped; it moves.
- Copy the screenshots the README uses into `docs/screenshots/` so the page does not
  depend on `.ai/` QA artifact folders that later runs may prune or rename. Sources
  are the committed QA artifacts of the E02 slices run and the availability-slots and
  mentor-prices final gates.

### Non-goals

- No product-code changes, no test changes, no dependency changes.
- No new claims about behavior the repository does not have: booking, payment and the
  text session are open pull requests, not `master`, so the README marks them as
  in-progress rather than shipped.
- No `LICENSE` file. The repository is `private: true` with no license field and no
  `LICENSE`; choosing an open-source license is the owner's call, so the README states
  the current position accurately and the PR raises the choice.
- No `CONTRIBUTING.md`; the repository already documents its process in `SDLC.md`,
  `AGENTS.md`, `CODE_REVIEW.md` and `BACKWARD_COMPATIBILITY.md`, and the README links
  them rather than forking a fifth copy of the same rules.

## Risks

- **Stale claims.** A README that shows screenshots of features must describe what is
  on `master`. Mitigated by checking the route list and `CHANGELOG.md` 0.1.0 before
  writing, and by labelling booking/payment as in progress.
- **Broken image paths.** Relative image links render on GitHub only when the files
  are committed at the referenced path. Mitigated by a link/path check in Phase 3.
- **Lost reference material.** Moving 250 lines of configuration detail risks dropping
  a variable. Mitigated by diffing the moved sections against the old README before
  the phase commit.

## Implementation Plan

### Phase 1: Source material

1.1 Copy the chosen QA screenshots into `docs/screenshots/` under descriptive names.
1.2 Write `docs/DEVELOPMENT.md` with every technical section moved out of the README,
    reorganized under its own table of contents.

### Phase 2: README rewrite

2.1 Rewrite the top of the README: title, badges, one-line pitch, hero screenshot,
    business value, and use cases per persona.
2.2 Write the feature sections with their screenshots and a status note for work still
    in review.
2.3 Write Getting Started (one paragraph plus the command block), the documentation
    index, Contributing, and License.

### Phase 3: Verification

3.1 Check every relative link and image path resolves in the worktree, re-read the
    full diff against the brief, and run the validation gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Source material

- [ ] 1.1 Copy QA screenshots into `docs/screenshots/`
- [ ] 1.2 Write `docs/DEVELOPMENT.md` with the moved technical reference

### Phase 2: README rewrite

- [ ] 2.1 Title, badges, hero, business value and use cases
- [ ] 2.2 Feature sections with screenshots and status
- [ ] 2.3 Getting Started, documentation index, contributing and license

### Phase 3: Verification

- [ ] 3.1 Link/path check, diff re-read, validation gate

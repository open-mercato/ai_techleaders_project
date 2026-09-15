# Execution plan: manual GitHub release workflow

## Goal

Ship a manually executed GitHub Action that safely versions every DevMentor package,
creates a recoverable tag, and publishes the matching curated changelog entry as a
GitHub Release.

## Scope

- A release helper and exhaustive unit tests under `scripts/release/`.
- A manual workflow under `.github/workflows/`.
- Coverage configuration and concise release-manager documentation.
- No npm/package artifact publication, deployment, changelog generation, prerelease
  versions, or branch-protection bypass.

Source doc: `.ai/specs/2026-09-15-manual-github-releases.md`

## Implementation plan

### Phase 1: Release contract

1. Add and exhaustively test stable-SemVer resolution, repository version consistency,
   lockfile verification, and exact changelog-entry extraction.
2. Add the release helper to the per-file coverage gate and document the operator-facing
   release contract.

### Phase 2: GitHub workflow

1. Add the serialized manual workflow with default-ref enforcement, isolated
   least-privilege credentials, full validation, atomic default-branch/tag publication,
   GitHub Release creation, and safe recovery.
2. Add static workflow regression tests for its inputs, permissions, validation, tag,
   changelog, and release invariants.

### Phase 3: Verification

1. Run the complete repository validation gate and the authoritative PR review/autofix
   pass, addressing any actionable findings.

## Risks

- A repository rule can reject `GITHUB_TOKEN` writes to the default branch. The atomic
  push prevents a tag-only partial release, but repository settings must allow the
  intended release actor.
- Pushes made by `GITHUB_TOKEN` do not start the pull-request-only CI workflow, so the
  release workflow must run the equivalent build, type, lint, unit-coverage, Storybook,
  prototype, and integration gates before it receives the token used to publish.
- GitHub Release creation occurs after the atomic push and can fail independently. The
  same-version custom recovery path completes publication only when the existing tag
  already points at the checked-out release commit.
- The workflow deliberately refuses to invent release notes: the changelog entry must
  already exist and contain no unresolved TODO marker.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Release contract

- [ ] 1.1 Add and test release version, manifest, lockfile, and changelog rules
- [ ] 1.2 Add coverage enforcement and release-manager documentation

### Phase 2: GitHub workflow

- [ ] 2.1 Add the safe manual GitHub release workflow
- [ ] 2.2 Add static workflow regression coverage

### Phase 3: Verification

- [ ] 3.1 Pass the full validation and authoritative review gates

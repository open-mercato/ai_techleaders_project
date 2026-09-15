# Manual GitHub releases

## Problem and goal

DevMentor has a curated `CHANGELOG.md` and aligned versions in the root and workspace
package manifests, but it has no repeatable release operation. A release manager must be
able to start one GitHub Actions run, choose a major, minor, patch, or explicit version,
and obtain a traceable GitHub Release without manually coordinating manifest edits, a
commit, and a tag.

The goal is a manually dispatched release workflow that validates the intended stable
SemVer, updates every workspace version and the lockfile, commits that state to the
default branch, creates an annotated `v<version>` tag at the same commit, and publishes
the matching changelog entry as the GitHub Release notes.

## Non-goals

- Publishing npm packages or application/container artifacts.
- Deploying DevMentor or running post-release smoke tests.
- Generating or editing changelog prose during the release run.
- Supporting prerelease/build SemVer identifiers or moving an existing release tag.
- Bypassing default-branch protection; repository settings must explicitly allow the
  workflow token to make the release commit.

## Approach

- Add a `workflow_dispatch` workflow with a required choice input (`patch`, `minor`,
  `major`, `custom`) and an optional custom-version string used only with `custom`.
- Reject dispatches from any non-default ref and explicitly check out the latest default
  branch. Serialize release runs and grant only `contents: write`; checkout does not
  persist credentials, and the release token is exposed only to the final publication
  step, after repository code has finished running.
- Put version resolution, package-version verification, and changelog extraction in a
  dependency-free Node script with exhaustive unit tests. Custom versions are stable
  `MAJOR.MINOR.PATCH` values and cannot go backwards.
- Use npm's workspace-aware `version` command to update the root manifest, all workspace
  manifests, and `package-lock.json`; verify all of them before committing.
- Run the repository validation gate, including per-file unit coverage, before publishing.
  Push the release commit and an
  annotated `v<version>` tag atomically, then create the GitHub Release with
  `--verify-tag` and the extracted changelog section.
- Permit a recovery run with `custom` set to the current version when the existing tag
  is annotated, belongs to the current default-branch history, and its tagged manifests,
  lockfile, and changelog are self-consistent, but the GitHub Release was not created.
  Publish from that tagged commit even when the default branch has advanced. Never
  overwrite or relocate an existing tag.

## Acceptance criteria

- The Actions UI offers patch, minor, major, and custom version choices, with a separate
  custom-version field and actionable validation errors for invalid combinations.
- All tracked root/workspace `package.json` versions and their `package-lock.json`
  records equal the selected release version.
- A release fails before mutation when package versions disagree, the changelog lacks a
  complete `# <version> (...)` entry, the version moves backwards, or a release already
  exists.
- A dispatch against a non-default branch is rejected, and install/build/test steps do not
  receive a persisted checkout credential or release token.
- A successful run leaves the default branch at a release commit, an annotated
  `v<version>` tag pointing at that exact commit, and a published GitHub Release whose
  body is the corresponding changelog entry.
- Concurrent release runs cannot race. A rejected default-branch push does not leave a
  remote tag behind, and a same-version custom rerun can finish release publication
  after a failure that happened after the atomic push, including after later commits
  reached the default branch.
- Unit coverage is 100% for the release helper and includes bump, custom, manifest,
  lockfile, changelog, and recovery-relevant edge cases.

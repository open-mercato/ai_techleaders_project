# Restore Railway PR previews

## Requested

Repair Railway's per-pull-request preview deployment, which had worked after PR #63
was merged the previous week and no longer started for the current PR.

## Done

- Reconstructed the verified PR #63 Railway setup from its committed run record and
  the production-container work merged in PR #62.
- Compared the current PR lineage with `master` and found that
  `recording/lesson-14` forked before PR #62. Its PR heads therefore still supplied
  Railway with the original two-line placeholder Dockerfile, which had no runtime
  command.
- Confirmed against Railway's current documentation that a PR environment deploys a
  single GitHub branch and automatically uses a root `Dockerfile` when present.
- Restored the complete production container surface on the current PR branch:
  multi-stage Node image, safe build context, production secret preflight, and
  production-installed MikroORM migration tooling.
- Preserved the current booking/payment implementation and the unrelated existing
  `.ai/cezar/.gitignore` worktree change.

## Files touched

- `.dockerignore`
- `Dockerfile`
- `package.json`
- `package-lock.json`
- `packages/core/src/container/container.ts`
- `packages/core/src/container/index.ts`
- `packages/core/src/index.ts`
- `packages/db/package.json`
- `.ai/lessons.md`
- `.ai/runs/2026-09-24-restore-railway-pr-previews.md`

## Outcome

- `npm ls --omit=dev @mikro-orm/cli tsx dotenv` passed and confirmed all migration
  runtime tools survive the production prune.
- The production preflight passed with non-secret test values.
- `npm run build`, `npm run lint`, and `npm run typecheck` passed. Lint reported only
  nine pre-existing warnings and no errors.
- `npm run test:unit:coverage` passed 195 files and 2,188 tests with 100% statements,
  branches, functions, and lines.
- The user explicitly authorized publishing the repair to PR #68,
  `recording/lesson-14`, and PR #69 after the local verification completed. Branch
  pushes are sufficient to trigger Railway; no direct Railway project mutation is
  required.

## Follow-ups

- Confirm the branch-triggered Railway deployments create healthy preview services.

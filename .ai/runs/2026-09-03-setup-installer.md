# Run log — one-command idempotent setup installer

Date: 2026-09-03
Branch: `fix/37-setup-installer`
PR: #38
Issue: #37
Spec: `.ai/specs/2026-09-03-setup-installer.md`

## Requested

Two phases, both autonomous:

1. **Implement** — give contributors a one-command, idempotent `npm run setup` that
   installs dependencies, preserves local environment configuration, provisions or
   reuses PostgreSQL, migrates, and seeds, then hands off to `npm run dev` (issue #37).
2. **Review and fix** — run `om-code-review` against PR #38 and then "fix all",
   resolving every finding the review raised.

## Note on scope of this log

Phase 1 landed in commit `1906b13` without a run log, which phase 2's review flagged.
The phase-1 section below is reconstructed from the PR body, the diff, and the two
lesson entries that run left behind — it is a record, not a first-hand account. The
phase-2 section is first-hand.

## Phase 1 — implementation (reconstructed)

Added `scripts/setup/` as plain Node ESM using only `node:*` built-ins, split into
pure decisions (`steps.mjs`), injectable effects (`effects.mjs`), ordering
(`run.mjs`), and a composition-only entry point (`index.mjs`). Registered
`npm run setup`. Made `DatabaseSeeder` idempotent and excluded colocated `*.test.ts`
from MikroORM's seeder glob. Added unit tests for every new file plus integration
coverage that seeds twice. Documented the path in `README.md` and `AGENTS.md`.

Two gotchas were hit and recorded in `.ai/lessons.md`: MikroORM's default seeder glob
importing Vitest files, and `spawn()`'s `error` event needing to be data rather than an
exception so a Docker-less machine gets the actionable message.

## Phase 2 — review and fix (first-hand)

### Review

Ran the full validation gate on the PR head: `npm run typecheck`, `npm run lint`,
`npm run test`, and `npm run build` all passed. Also ran the CI coverage check
(`npm run test:unit:coverage`), which passed at 100% on all four metrics; because the
v8 text table renders empty under Vitest 4, non-vacuousness was confirmed by reading
`coverage/unit/coverage-final.json` and checking all seven `coverage.include` entries
were genuinely measured.

`npm run test:integration` could **not** be run: Docker is unavailable in this
environment and Testcontainers requires it. Substitute evidence was gathered instead —
this environment happens to have PostgreSQL on 5432 and no Docker, which is exactly
the bring-your-own-PostgreSQL case, so `npm run setup` was executed twice for real. It
skipped provisioning without touching Docker, exited 0 both times, and a direct SQL
query confirmed one `ada@devmentor.dev` user and one `mentor_profiles` row. That
verifies acceptance criteria 2, 4, and 7 end to end against a live database.

The review found no blockers, one major, five minors, and two nits.

### Fixes applied

- **Major — stale `process.env` invariant.** `scripts/setup/effects.mjs` reads
  `process.env`, but `AGENTS.md` still claimed "Nothing else reads `process.env`
  directly" and `CODE_REVIEW.md` still named `tests/integration/environment.ts` as the
  single exception. The installer's direct access is correct and stays (it runs before
  `npm install` and cannot import zod); both documents now record it as the second
  documented exception, with a note that the `DATABASE_URL` precedence must stay in
  step across all three readers.
- **Minor — false "incomplete `.env`" warning.** `missingEnvKeys` compared raw key
  lists, so a `.env` following the README's own bring-your-own-PostgreSQL advice
  (`DATABASE_URL` only) was warned about five variables it deliberately does not need.
  Added `DATABASE_URL_SUPERSEDES` and made a configured `DATABASE_URL` satisfy the
  discrete connection variables; pool sizing and `DB_DEBUG` stay required. Reproduced
  against the real `.env.example` before and after.
- **Minor — over-claiming provision message.** A TCP probe proves only that something
  answers, so the `skipped` detail no longer asserts it found PostgreSQL; it reports
  what was observed and states the assumption. `README.md` updated to match, including
  the limitation and where the real error surfaces.
- **Minor — idle interval before giving up.** `waitForDatabase` slept after its final
  poll, adding a wasted interval to the timeout path. The sleep is now skipped on the
  last attempt.
- **Minor — generated-file churn.** Reverted `packages/app/next-env.d.ts` to its
  `master` content; the `.next/dev` → `.next` flip is a Next build artifact unrelated
  to this change. Note it is rewritten by any local `next build`/`next dev`, so it was
  reverted after the final gate run.
- **Minor — missing SDD artifacts.** Wrote `.ai/specs/2026-09-03-setup-installer.md`
  and this run log.
- **Major (found while fixing, missed by the review itself) — flaky new test.**
  Chaining the coverage run straight after `npm run build` made
  `packages/db/src/config.test.ts` fail two cases on a 5s test timeout. Root cause: its
  `loadOrmConfig` helper called `vi.resetModules()` and re-imported `./config` per
  test, so every case re-imported the whole `@mikro-orm/*` graph from cold *inside* the
  test body. Reproduced deterministically by running the suite under 8 busy-loops on a
  3-core box: 2 failed / 131 passed, the file taking 25s. Fixed by stubbing `getDbEnv`
  via `vi.mock('./env')` instead of writing `process.env`, which imports the MikroORM
  graph once at module load (where no test timeout applies) and drops per-test work to
  9ms. The same load now yields 134 passed. This also removed the file's dependence on
  ambient `process.env` and on test order, and added a pool-passthrough case.
- **Nit — `intervalMs: 0` would spin forever.** `Math.ceil(t / 0)` is `Infinity`, so
  the interval is now clamped to at least 1ms.
- **Nit — opaque occurrence assertion.** Replaced
  `expect(snapshot.split(...)).toHaveLength(2)` with an explicit regex match count.

### Test changes

Coverage stayed at 100% per file (133 tests, up from 128). Added: a `missingEnvKeys`
regression test for the `DATABASE_URL`-only `.env` plus cases for an empty
`DATABASE_URL` and for variables a URL cannot supply; a `configureEnvironment` case
asserting `skipped` rather than `warned` on that `.env`; a sleep-count assertion that
fails against the old poll loop; and a zero-interval clamp test. Renamed the
"no-op-shaped second run" case to describe what it actually asserts, with a comment
pointing at the integration test that proves real idempotency.

## Files touched

Phase 2 only (phase 1's file list is the PR diff):

- `scripts/setup/steps.mjs`, `scripts/setup/steps.test.mjs`
- `scripts/setup/run.mjs`, `scripts/setup/run.test.mjs`
- `packages/db/src/config.test.ts` (rewritten to remove the flake)
- `tests/integration/setup.integration.test.ts`
- `AGENTS.md`, `CODE_REVIEW.md`, `README.md`
- `packages/app/next-env.d.ts` (reverted to `master`)
- `.ai/specs/2026-09-03-setup-installer.md`, `.ai/runs/2026-09-03-setup-installer.md`,
  `.ai/lessons.md`

## Outcome

Every review finding is resolved, plus one the review missed (the `config.test.ts`
flake). The full gate passes — `npm run typecheck`, `npm run lint` (0 errors),
`npm run test` (134 passed), `npm run build` — and per-file coverage holds at 100% on
all four metrics for all seven `coverage.include` entries. The suite was additionally
verified under deliberate CPU contention, which is how the flake was caught. The
installer was exercised twice against a live PostgreSQL with no Docker present, and the
idempotency invariant was verified by direct SQL (one `ada@devmentor.dev` row, one
`mentor_profiles` row).

## Follow-ups for a human

- **`npm run test:integration` has never been run for this branch.** Docker was
  unavailable locally, so `tests/integration/global-setup.ts`'s double seed and the new
  `setup.integration.test.ts` will execute for the first time in CI. Watch that check.
- Acceptance criteria 1 and 5 (fresh clone *with* Docker; no database *and* no Docker)
  are covered by unit tests but were never exercised on real infrastructure.
- `packages/app/next-env.d.ts` is committed but rewritten by every local
  `next build`/`next dev`. It has now churned across at least two PRs. Consider
  git-ignoring it, or settling on one variant deliberately.
- `npm run lint` emits two warnings (0 errors) from a coverage report left inside
  `.ai/cezar/worktrees/…` by an earlier agent run. `eslint.config.mjs` ignores
  `coverage/**` but not `**/coverage/**`, so nested copies leak in. Unrelated to this
  change and deliberately left alone; worth a one-line ignore fix on its own PR.
- Reusing an arbitrary listener on the configured port assumes the DevMentor database,
  role, and credentials already exist there; setup provisions none of them. If that
  proves confusing in practice, a real PostgreSQL handshake (`SSLRequest` and its
  single-byte reply) would let setup verify the peer instead of assuming.

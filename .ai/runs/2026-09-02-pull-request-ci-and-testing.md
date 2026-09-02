# Run log — pull-request CI and testing foundations

Date: 2026-09-02
Branch: `ci/pull-request-testing`
Start commit: `ec378c10c9a4eb719c8caa4afa8690a007b23a71`
Spec: `.ai/specs/2026-09-02-pull-request-ci-and-testing.md`

## Requested

Create GitHub pull-request gates for build and lint, introduce a TypeScript unit-test
framework, and add an integration framework that boots the app with an ephemeral
Testcontainers PostgreSQL instance and tests it with `agent-browser`. Make
`AGENTS.md` require 100% unit coverage for every new feature. Additionally, cover
PR #3's `packages/core/src/http/makeCrudRoute.ts` at 100% and add browser integration
coverage for the home page and basic admin surfaces. When complete, commit and push
the work, open a pull request against `master`, and keep fixing/monitoring it until
all CI checks pass.

## Assumptions

- Node 24 is the repository and CI floor because current Testcontainers and
  agent-browser releases require it; retaining the Node-20-compatible tool line
  exposed a high-severity transitive audit finding.
- The current health route and seeded admin-users page are the smallest meaningful
  end-to-end scenario for proving app, DI, MikroORM, PostgreSQL, and browser wiring.
- The linked PR #3 diff hash resolves to
  `packages/core/src/http/makeCrudRoute.ts`; the work is based on PR #3's merged branch
  because that file is not present on `master`.
- The pre-existing modification to `packages/app/next-env.d.ts` belongs to the user
  and will not be changed or reverted by this run.

## Tasks

- [x] Add and verify Vitest unit tests and 100% coverage thresholds.
- [x] Add and verify the Testcontainers + production-app lifecycle.
- [x] Observe the running app and add deterministic `agent-browser` scenarios.
- [x] Add and validate the pull-request GitHub Actions workflow.
- [x] Update contributor and developer documentation.
- [x] Run the full local validation gate and audit the diff against the spec.

## Execution log

### 2026-09-02 05:45 CEST

- Reviewed `AGENTS.md`, `.ai/lessons.md`, the implemented bootstrap spec/run, package
  manifests, application/database lifecycle, and current working tree.
- Confirmed there is no existing CI, unit runner, browser descriptor, shared test
  environment, or integration suite.
- Confirmed `packages/app/next-env.d.ts` was already modified before this run.
- Consulted current official Vitest, Testcontainers, and `agent-browser`
  documentation. An initial Node-20-compatible dependency selection was discarded
  after `npm audit` reported a high-severity transitive `undici` advisory; the plan
  was revised to Node 24 and current pinned test tools.
- Resolved the user-provided GitHub diff hash to
  `packages/core/src/http/makeCrudRoute.ts` and created local branch
  `ci/pull-request-testing` from `origin/feat/devmentor-monorepo-bootstrap` (the merged
  PR #3 branch) so the requested tests run against their production target.

## Outcome

Implementation complete and locally verified; publication and remote CI monitoring
are in progress. The spec remains active until the PR is merged, per repository
lifecycle rules.

## Files touched

- `.github/workflows/ci.yml`; root test configs/scripts/dependencies; unit and
  integration test sources; `AGENTS.md`; `README.md`; this spec and run log.

## Verification

### 2026-09-02 06:10 CEST — final local publish gate

- `npm ci --include=optional` — passed from the portable lockfile; representative
  macOS/Linux SWC, esbuild, Lightning CSS, Tailwind Oxide, and Sharp optional package
  entries were confirmed present.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings after generated coverage/test artifacts
  were added to ESLint's global ignores.
- `npm run test:unit:coverage` — 17/17 tests passed;
  `packages/core/src/http/makeCrudRoute.ts` reports 100% statements (56/56), branches
  (26/26), functions (15/15), and lines (50/50).
- `npm run build` — passed without a database.
- `npm run test:integration` — 2/2 scenarios passed against a new PostgreSQL 17
  Testcontainer and production Next.js process. Agent-browser asserted the home page,
  connected admin dashboard, and seeded Ada Lovelace users table; screenshots were
  inspected in `test-results/integration/`.
- `npm audit --audit-level=high` — passed with zero vulnerabilities after revising the
  runtime floor to Node 24 and selecting Testcontainers 12.1.0 / agent-browser 0.36.0.
- GitHub workflow YAML parsed successfully. `actionlint` was unavailable locally, so
  GitHub Actions remains the authoritative workflow-schema execution check.

## Failures found and fixed during the run

- Vitest initially discovered generated pino tests under `.next`; explicit generated
  output exclusions fixed discovery without narrowing production coverage.
- The first integration bootstrap found a stale installed tree missing the macOS
  esbuild binary and an overly broad root test glob. A clean `npm ci` plus the corrected
  include pattern fixed both and proved the same clean-install path used in CI.
- MikroORM v7 wrote a duplicate `migrations/devmentor.json` snapshot during ephemeral
  migration. The harness now passes the committed `.snapshot-devmentor` name through
  its isolated child environment, and repeated runs leave the source tree unchanged.
- The first Node-20-compatible Testcontainers selection produced a high-severity
  transitive audit finding. The plan was revised to the current Node 24 toolchain,
  which audits cleanly.

## Follow-ups

- Configure GitHub's `master` ruleset to require the exact Build, Lint, Unit tests,
  and Integration tests check names if it is not already configured; workflows alone
  report checks but do not make them merge-blocking.

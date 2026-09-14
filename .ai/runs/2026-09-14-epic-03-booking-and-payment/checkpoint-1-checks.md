# Checkpoint 1 — Phase 1 (mentor discovery, E03-S01 / #20)

**Run at:** 2026-09-14T07:20:40Z
**Steps covered:** 1.1, 1.1-review-fix, 1.2, 1.3, 1.4, 1.4-review-fix
**Commits:** `219290a..edc15ed`
**Touched areas:** `@devmentor/ui` (mentor components, money helper), `@devmentor/core`
(mentor profile service), `@devmentor/app` (`/api/mentors`, `/mentors`, landing page)

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | ✅ pass | Whole monorepo, clean. |
| `npm run lint` | ✅ pass | 0 errors. One pre-existing warning in `prototypes/devmentor-journey/LandingScreen.tsx` (`<img>` vs `next/image`), untouched by this run. |
| `npm run test:unit:coverage` | ✅ pass | 155 files, 1769 tests. Statements/branches/functions/lines all 100% per file, including the five files this phase added. |
| Browser scenario — public mentor list | ✅ pass | Full harness: ephemeral PostgreSQL (Testcontainers), migrations, seed, production build, real Chrome. See below. |
| `npm run build` | ⏭️ not run separately | The integration harness builds the app in production mode as part of its setup, and that build succeeded — a standalone re-run would prove the same thing. The final gate runs it explicitly. |

## Browser verification

Driven through the repository's own integration harness (`vitest.integration.config.mts`,
`tests/integration/`) so the app under test is the production build against a real
database, not a mocked render. Proven against acceptance criteria 1–4 of #20:

- A published mentor with both prices and a future slot appears, with both prices as
  separate chips (`PLN 90.00`, `PLN 180.00`) and the next available time.
- `?tag=TypeScript` keeps the mentor; `?tag=Python` removes them and shows the recovery
  empty state with a working "Clear filter".
- The accessibility tree carries **no `searchbox` role** and no text matching
  `rating|review|score|featured` (R13, N02), asserted with `expectAbsent`, which requires
  a positive control (`heading "Find a mentor"`) so an empty snapshot cannot pass.

Artifacts in `checkpoint-1-artifacts/`:

- `checkpoint-1-mentor-list.png` — the populated list.
- `checkpoint-1-mentor-list-tagged.png` — filtered to TypeScript.
- `checkpoint-1-mentor-list-empty.png` — the Python empty state and its recovery action.
- `unit-coverage.log` — the coverage summary above.

## Findings fixed inside this checkpoint

- **`1.4-review-fix`** — the first screenshot read "1 mentors available". `MentorDirectory`
  hard-coded the plural. It had existed since the component was written; a component with
  no real page rendering exactly one result could not surface it. Fixed, and the evidence
  above was recaptured after the fix rather than kept from before it.

## Environment caveat — Chrome runs over CDP, not locally

`agent-browser`'s bundled Chrome cannot start on this machine: it is missing system
libraries (`libnspr4.so` and the rest of the `--with-deps` list) and the account has no
`sudo`, so `npm run test:browser:install:ci` cannot install them.

The run therefore attaches to a headless Chrome in a container
(`docker run --rm --network host chromedp/headless-shell`) via
`agent-browser connect 9222`. Host networking is what lets that Chrome reach the harness's
ephemeral app port on `127.0.0.1`.

This is a **workstation limitation, not a product one**, and CI is unaffected — it runs
`test:browser:install:ci` with root. The permanent scenarios (Steps 7.2–7.6) will make the
CDP endpoint a harness option (`AGENT_BROWSER_CDP`) rather than repeat this in each test,
so a machine that can launch Chrome locally keeps doing so.

The scenario used here is temporary and deliberately uncommitted: it exists to produce this
checkpoint's evidence. Step 7.2 lands the permanent
`tests/integration/mentor-booking.integration.test.ts` covering the same criteria.

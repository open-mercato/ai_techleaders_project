# Lesson 14 recording environment run

## Requested

Prepare the DevMentor environment for recording Lesson 14 and prove that the three defect
scenarios described in the lesson can be reproduced.

## Plan

- [x] Read the lesson and extract the exact scenario and expected workflow states.
- [x] Audit the repository, branches, issues, and PR references against the lesson.
- [x] Move to a local recording branch based on PR #53, where bookings exist.
- [x] Repair and cold/warm verify the reusable Linux environment launcher.
- [x] Add deterministic recording fixtures and the three recording-only regressions.
- [x] Run the normal unit gate and focused scenario verification.
- [x] Capture the final base URL, limits, and presenter handoff.

## Findings so far

- `master` has no booking domain; PR #53 is the only viable source branch.
- PR #53 already fixes all three lesson defects and its default seed has no public,
  priced mentor slots, so the lesson is not reproducible without a purpose-built branch.
- Lesson references #41 and #45 are unrelated closed PRs, not the issue/fix PR shown in
  the prose. GitHub CLI is not authenticated in this workspace.
- The checked-in launcher was macOS-only. It failed on Linux because it required `jq`,
  Docker, BSD `date`, and `launchctl`. The repaired launcher uses the installed PostgreSQL
  17 server, production Next.js, random loopback ports, and Node for JSON handling.
- Cold boot and immediate warm reuse succeeded. Browser Chrome downloaded, but doctor
  cannot launch it because the sandbox lacks Linux shared libraries and passwordless
  package installation; a host browser remains usable for recording.

## Verification

- Final cold start after the hydration fix: 23 seconds; immediate warm reuse: 1 second.
- Final base URL: `http://127.0.0.1:40339`.
- `/m/ada-legacy` rendered a literal `undefined` paragraph for the missing bio.
- `/api/mentors/mock-mentor` offered the slot seeded 30 minutes ahead with
  `meetsLeadTime: true`.
- An authenticated 50-minute `POST /api/bookings` for that slot answered 200 and retained
  the correct server price of PLN 180.00, isolating the displayed PLN 90.00 summary as a
  client regression. The fixture was reset immediately after this proof.
- A focused jsdom rendering check proved that selecting 50 minutes leaves the summary at
  PLN 90.00; the temporary proof file was removed afterward so the recording baseline keeps
  the intentionally incomplete assertion described by the lesson.
- Browser screenshots preserve both visible recording states in
  `.ai/qa/lesson-14-recording/`: the literal missing-bio value and a selected 50-minute
  session whose total incorrectly remains PLN 90.00.
- The existing Next development log traced the reported hydration warning to Grammarly's
  `data-new-gr-c-s-check-loaded` and `data-gr-ext-installed` attributes on `<body>`, not to
  admin markup. The root layout now suppresses only that body host-node mismatch; clean
  browser runs of `/admin` and client navigation to `/admin/users` had no console or page
  errors.
- The workspace-managed preview at `http://127.0.0.1:3000` originally used its configured
  PostgreSQL address (`127.0.0.1:5432`, database `open-mercato`) while the recording launcher
  had provisioned an unrelated random port. `TEST_ENV_PREVIEW=1` now prepares that exact
  disposable database without fighting the preview supervisor. After restarting its child
  app to clear the earlier failed ORM module graph, `/api/health` reported `database: up`,
  mock-operator sign-in reached `/admin`, and browser console/page errors were empty.
- `npm run typecheck`: passed.
- `npm run lint`: passed with one pre-existing Next.js `<img>` warning and no errors.
- `npm run test:unit:coverage`: 195 files and 2,184 tests passed; statements, branches,
  functions, and lines are all 100%.

## Files touched

- `.ai/scripts/test-env-up.sh`
- `.ai/scripts/test-env-down.sh`
- `.ai/skills/om-prepare-test-env/SKILL.md`
- `.gitattributes`
- `.ai/specs/2026-09-24-lesson-14-recording-environment.md`
- `.ai/runs/2026-09-24-lesson-14-recording-environment.md`
- `.ai/lessons.md`
- `package.json`
- `scripts/lesson-14/seed.mts`
- `packages/ui/src/components/mentors/MentorPageView.tsx`
- `packages/ui/src/components/mentors/MentorPageView.test.tsx`
- `packages/app/src/app/m/[slug]/book-session-panel.tsx`
- `packages/app/src/app/m/[slug]/book-session-panel.test.tsx`
- `packages/app/src/app/layout.tsx`
- `packages/app/src/app/layout.test.tsx`
- `packages/core/src/services/availability/slot.service.ts`
- `packages/core/src/services/availability/slot.service.test.ts`
- `packages/core/src/services/bookings/booking.service.ts`
- `packages/core/src/services/bookings/booking.service.test.ts`
- `.ai/qa/test-env.json`
- `.ai/qa/test-env-build-cache.json`
- `.ai/qa/test-env-app.log`
- `.ai/qa/test-env-postgres.log`
- `.ai/qa/lesson-14-recording/missing-bio.png`
- `.ai/qa/lesson-14-recording/wrong-price-summary.png`
- `vitest.config.mts`

## Outcome

The local recording branch and workspace preview are ready at `http://127.0.0.1:3000`.
Recreate the preview-compatible disposable database with
`TEST_ENV_PREVIEW=1 sh .ai/scripts/test-env-up.sh --force`, or source
`.ai/qa/test-env.env` and run `npm run lesson:14:seed` between takes to clear holds and
refresh the relative slot times. The launcher also keeps a companion production process at
the `baseUrl` in `.ai/qa/test-env.json` for production-mode readiness checks.

The complete GitHub issue/PR automation cannot be recorded from this workspace yet:
`gh auth status` reports no authenticated account, and the lesson's #41/#45 examples are
already unrelated closed pull requests. Before that take, authenticate a disposable fork
or recording repository and use the fresh issue/PR numbers it creates. The checked-in
launcher still reports browser automation unavailable because the host lacks Chrome's Linux
shared libraries. For final QA, those libraries were unpacked without root into a temporary
directory and `/admin` loaded with no console or page errors; use a host browser for the
recording itself.

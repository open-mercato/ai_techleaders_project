# Fix issue #66 — mentor public page shows literal "undefined" when bio is empty

## Requested

Run `om-auto-fix-issue` on GitHub issue #66 ("Fix: mentor public page shows literal
\"undefined\" when bio is empty"): a mentor with no `bio` shows the literal text
`undefined` under the "About" heading on their public profile page.

## What was done

- Triaged: confirmed a real, unfixed defect — no open/merged PR or commit addressed it,
  no assignee, no `in-progress` lock.
- **Base-branch discovery (repeat of the #65 pattern):** the config's `baseBranch: "auto"`
  resolves to `master`, but `master`'s `MentorPageView.tsx` never had a `'undefined'`
  fallback — `packages/ui/src/components/mentors/MentorPageView.tsx:40` there renders
  `{profile.bio}` directly. The bug only exists on `recording/lesson-14`, which plants it
  deliberately (`.ai/specs/2026-09-24-lesson-14-recording-environment.md`, defect 1 of 3)
  for a recorded lesson. PR #68 (issue #65, the sibling lead-time defect from the same
  spec) already established the precedent of branching from and opening against
  `recording/lesson-14` with an explicit shipping request in place — followed the same
  pattern here instead of re-deriving it.
- Root cause: `packages/ui/src/components/mentors/MentorPageView.tsx:40` rendered
  `profile.bio || 'undefined'` — a hardcoded string literal fallback, not an accidental
  JS-`undefined` stringification. `bio` is nullable end-to-end (entity field, DTO cast in
  `mentor-profile.service.ts:149`), so any mentor with an empty/null bio hit the fallback.
- Fix: replaced the literal-string fallback with a proper empty state — `profile.bio ?
  <p>{profile.bio}</p> : <p>No description provided yet.</p>` — matching this file's own
  existing empty-state convention for prices/availability (a plain muted `<p>`, not the
  list-oriented `EmptyState` component). Did not touch the `bio: profile.bio as string`
  cast in `toPublicDto` (issue's explicit non-goal) or the publish-readiness gate; the
  render-side fix treats `bio` as possibly falsy regardless of its declared type.
- Rewrote `MentorPageView.test.tsx:45-48`, which had asserted the bug (`getByText('undefined')`)
  as expected behavior, into a parametrized regression test over `null`/`undefined`/`''`
  asserting the new empty-state text and the absence of a literal `"undefined"` node.
  Verified by temporarily reverting the component change only: the new test fails (3
  failures) against the pre-fix code and passes once the fix is restored.
- Full validation gate: `npm run typecheck`, `npm run lint`, `npm run test:unit:coverage`
  (195 files / 2186 tests, 100% statements/branches/functions/lines), `NODE_ENV=production
  npm run build` — all green. (`npm install` in this sandbox did not pull the `stripe`
  dependency declared in `packages/core/package.json`; installed it explicitly with
  `npm install stripe --workspace=@devmentor/core --no-save` so the production build could
  resolve `stripe-payment-gateway.ts` — no `package.json`/lockfile change, pre-existing
  environment gap unrelated to this fix.)

## Outcome

Fix implemented, tested, and validated locally on `fix/issue-66-mentor-bio-undefined`,
branched from `recording/lesson-14`. Following the #65/PR #68 precedent (explicit shipping
request already in effect for this lesson branch), pushed the branch and opened a PR
against `recording/lesson-14` with `Fixes #66`.

## Files touched

- `packages/ui/src/components/mentors/MentorPageView.tsx`
- `packages/ui/src/components/mentors/MentorPageView.test.tsx`
- `.ai/runs/2026-09-24-fix-issue-66-mentor-bio-undefined.md`

## Follow-ups

- None required for this fix. The unsafe `as string` casts in `toPublicDto` (`bio`,
  `publicWorkUrl`, `slug`) remain a pre-existing type-safety gap, explicitly out of scope
  per the issue, noted here again for a future cleanup pass.

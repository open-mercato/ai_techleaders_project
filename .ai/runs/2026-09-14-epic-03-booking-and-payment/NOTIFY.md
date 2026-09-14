# Notify — 2026-09-14-epic-03-booking-and-payment

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-09-14T07:04:12Z — run started
- Brief: implement epic 03 (booking and payment, #9) using Storybook design-system
  components, test everything, and post verification screenshots to the PR.
- External skill URLs: none.
- Classified as a Spec-implementation run: an epic with six stories and one integration
  task, spanning three new concept folders across all four packages.

## 2026-09-14T07:04:12Z — decision: one spec for the whole epic
- The epic and each story recorded a separate owed spec name
  (`-mentor-list`, `-booking-flow`, `-booking-notifications`, `-cancellation`,
  `-fee-split-and-payouts`). Written as one document,
  `.ai/specs/2026-09-14-booking-and-payment.md`, because all six share one entity, one
  money path and one set of invariants; five copies of the booking lifecycle would drift.

## 2026-09-14T07:04:12Z — decision: separate transfers, not destination charges
- Issue #25 left this to the spec. Chosen: separate Connect transfers after the session
  completes. Destination charges would require a mentor to finish Connect onboarding
  before anyone could book them, making E03 depend on E02-S05 shipping first.

## 2026-09-14T07:04:12Z — decision: minimal Connect surface, not E02-S05
- E03-S06 depends on E02-S05 (#19), which is unimplemented. This run adds only
  `stripeConnectAccountId` and `payoutsEnabled` on `MentorProfile` — what a payout
  decision reads — plus the hold branch. The onboarding flow stays with #19.

## 2026-09-14T07:04:12Z — decision: all Steps run inline
- The `Exec` column is `inline` for every Step: this session is configured not to spawn
  subagents, so the dispatcher pattern does not apply. Cadence, checkpoints and the
  one-commit-per-Step rule are unchanged.

## 2026-09-14T07:12:30Z — plan correction before Step 1.1
- Triage missed that the design system already ships the list shell: `MentorDirectory`
  lives in `components/mentors/MentorProfileCard.tsx` and its Storybook story names #20 as
  its consumer. Step 1.1 was planned to add a component that exists.
- Corrected: Step 1.1 now adds `MentorListingCard`, the public-list card the shell is
  missing (`MentorProfileCard` is the mentor's own card — status chip, no price). Spec and
  PLAN updated together. No Step ids changed; no Step has landed yet.

## 2026-09-14T07:14:00Z — decision: Commit cells are backfilled at checkpoints
- Filling a Step's `Commit` cell inside its own commit is self-referential: amending to
  write the SHA changes the SHA. Step 1.1 landed with a stale value (`3b54e12`) for
  exactly that reason; the real commit is `219290a`.
- From Step 1.2 on, a Step's own commit writes `pending` and the checkpoint commit
  backfills the real short SHAs. `Status` — the cell `om-auto-continue-pr-loop` actually
  resumes from — is still flipped inside the Step's own commit, unchanged.

## 2026-09-14T07:20:40Z — checkpoint 1
- Steps 1.1 through 1.4-review-fix (`219290a..edc15ed`): Phase 1, the public mentor list
  (#20), complete and verified.
- Typecheck, lint and the 100% per-file unit-coverage gate all pass (155 files, 1769
  tests). #20's four acceptance criteria proved in a real browser against the production
  build with ephemeral PostgreSQL.
- One finding fixed inside the checkpoint (`1.4-review-fix`): the live page read "1 mentors
  available". Evidence was recaptured after the fix.

## 2026-09-14T07:20:40Z — blocker worked around: no local Chrome
- `agent-browser`'s bundled Chrome cannot start on this machine — missing system libraries
  (`libnspr4.so` and the rest of `--with-deps`) and the account has no `sudo`, so
  `npm run test:browser:install:ci` cannot install them.
- Worked around by attaching to a containerized headless Chrome over CDP
  (`chromedp/headless-shell` with host networking, `agent-browser connect 9222`). CI is
  unaffected; it installs the dependencies as root.
- Follow-up owned by Step 7.2: make the CDP endpoint a harness option
  (`AGENT_BROWSER_CDP`) instead of repeating the connect in every scenario.

## 2026-09-14T07:41:00Z — checkpoint 2
- Steps 2.1 through 2.1-review-fix (`c5fb678..26776ba`): Phase 2, reserving a slot (#21),
  complete and verified.
- Typecheck, lint and the 100% per-file coverage gate pass. The bookings migration was
  proved up/down/up with entity-schema parity. Acceptance criteria 5–8 of #21 proved in a
  real browser; criterion 9 (the concurrency refusal) is unit-tested and gets its
  integration proof at Step 7.2.
- Two findings fixed inside the checkpoint: a React lint refusal on the timezone switch
  (`2.6-review-fix`), and the shared integration fixture being unable to delete a booked
  slot now that the FK restricts (`2.1-review-fix`) — the scenario passed and its cleanup
  was what failed.

## 2026-09-14T07:41:00Z — decision: migrate with the snapshot writer off
- `npm run db:migrate` with `DB_MIGRATIONS_SNAPSHOT=true` rewrites
  `migrations/devmentor.json` from database introspection, which reformatted CHECK
  constraints on `users`, `invitations` and `mentor_profiles` that this run never touched.
- Only `migration:create` writes that file from here on; `db:migrate` runs with
  `DB_MIGRATIONS_SNAPSHOT=false`. The committed snapshot diff for the bookings migration is
  purely additive as a result.

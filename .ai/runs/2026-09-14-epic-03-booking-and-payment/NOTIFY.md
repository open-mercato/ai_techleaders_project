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

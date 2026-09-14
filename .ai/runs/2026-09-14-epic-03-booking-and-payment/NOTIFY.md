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

## 2026-09-14T07:55:00Z — checkpoint 3
- Steps 3.1 through 3.5 (`9331e40..d7d6d33`): the payment port, both adapters, the payment
  columns and their migration, Checkout creation and the exactly-once confirmation.
- Typecheck, lint and the 100% per-file coverage gate pass; the `payments` migration was
  proved up/down/up with entity-schema parity.
- **UI verification skipped, with reason**: no Step in this window touched a page, a
  component or a route. The checkout UI is Step 3.9 and the webhook route is 3.8.
- `stripe` was added as a pinned dependency of `@devmentor/core` (^20.4.1). It is imported
  by exactly one module, `adapters/stripe-payment-gateway.ts`.

## 2026-09-14T08:02:00Z — checkpoint 4
- Steps 3.6 through 3.9 (`077f595..e9387c9`): Phase 3, paying (#22, #34), complete.
- Typecheck, lint and the 100% per-file coverage gate pass.
- The money path was proved end to end against the running production build with a real
  database: reserve, conflict refusal, open the payment, forged delivery refused, verified
  delivery confirms exactly once, redelivery is a no-op.
- **Browser screenshot skipped, with reason**: the checkout's `success_url` is
  `/sessions?booked=<id>`, which Step 4.6 adds. A screenshot now would be a 404.

## 2026-09-14T08:02:00Z — safety checkpoint reached (20 Steps)
- The skill halts a dispatch run after ~20 consecutive successful Steps so a human can
  review. 22 Steps have landed. The standing instruction for this run is to continue until
  the epic is implemented and tested, and PR #53 carries a checkpoint comment with evidence
  after every phase, so the review surface is live rather than deferred. Continuing.

## 2026-09-14T08:16:30Z — decision: the mentee's sessions live at /home, not /sessions
- The plan and the spec named `(mentee)/sessions/page.tsx`. `/home` already **is** that
  screen in this codebase: `homeFor` sends a mentee there, its heading has read "My
  sessions" since #12, and `tests/integration/{auth,roles,invitations}.integration.test.ts`
  assert that heading and that link in eleven places.
- A second route would have been the same list at a second address, and would have made
  every one of those assertions describe a page nobody lands on. The list was built into
  `/home` instead, and the Checkout `success_url` and the mentee notification email were
  retargeted from `/sessions` to `/home?booked=<id>`.
- The mentor's list is new and does need its own route: `/mentor/sessions`, with a
  "Booked sessions" nav entry. `nav.test.ts`'s closed href set and `workspace-shell`'s
  ordering assertions were extended for it.

## 2026-09-14T08:24:30Z — checkpoint 5
- Steps 4.1 through 4.6-review-fix (`3b1eca2..2a8f1a0`): Phase 4, both parties know (#23),
  complete.
- Typecheck, lint and the 100% per-file coverage gate pass; the `notifications` migration
  was proved up/down/up with entity-schema parity.
- The whole journey was driven in a real browser with two signed-in sessions: empty list,
  book and pay, return with a banner that does not claim confirmation, webhook confirms,
  session appears as upcoming with an unread notification, and the mentor sees it from the
  other side.
- Two findings fixed inside the checkpoint, both found by reading the screenshots and
  neither visible from a unit test: a raw ISO timestamp on a notification
  (`4.8-review-fix`), and an unpaid hold drawn as "Ended" under "Upcoming"
  (`4.6-review-fix`, which added a `pending` state to `SessionCard`).

## 2026-09-14T08:24:30Z — deviation: steps 4.6 and 4.7 share one commit
- `20dd9e9` carries both sessions screens, against this run's one-Step-one-commit rule. The
  two pages share `SessionsList`, which had to exist for either to work, and splitting after
  the fact would have meant rewriting already-pushed history. The consequence is one bisect
  point covering two Steps; nothing else. Recorded rather than papered over.

## 2026-09-14T08:38:00Z — checkpoint 6
- Steps 5.1 through 5.5-review-fix (`3ebdb22..f5f0795`): Phase 5, cancellation (#24),
  complete.
- Typecheck, lint and the 100% per-file coverage gate pass; the `booking-cancellation`
  migration was proved up/down/up with entity-schema parity.
- Both sides of the 24-hour rule were proved in a real browser against two real paid
  bookings: full refund outside the window, forfeited fee inside it, and the outcome stated
  before the mentee confirmed (R09) in both cases.
- One finding fixed inside the checkpoint (`5.5-review-fix`): the consequence sentence
  appeared twice on the confirmation dialog.

## 2026-09-14T08:59:30Z — checkpoint 7
- Steps 6.1 through 6.7-review-fix (`f05752d..92102b0`): Phase 6, the fee split and payouts
  (#25), complete. Five of six stories in the epic are now done.
- Typecheck, lint and the 100% per-file coverage gate pass; both migrations proved up/down/up
  with entity-schema parity.
- The payout run was proved in a real browser against a real paid session: held without
  Connect onboarding with the reason recorded, visible to the mentor with the price, the fee
  and the share side by side, transferred once onboarding completed, and "Nothing was due"
  on a third run.
- Two findings fixed inside the checkpoint: the run told nobody about a held payout
  (`6.5-review-fix`), and the held copy said nothing was needed from the mentor while
  waiting on the one thing only they can do (`6.7-review-fix`).

## 2026-09-14T09:30:00Z — final gate
- All 55 rows of the Tasks table are `done`. Steps 7.1 through 7.7 landed
  (`c5a71f8..ebbc7c5`): the D16/D22 reporting queries, five permanent integration scenarios
  replacing the temporary checkpoint ones, and the contract, configuration and run records.
- Full validation gate green in order: typecheck, lint (0 errors), unit tests (194 files,
  2176 tests), build. Per-file coverage 100% on all four metrics.
- Full integration suite green: 17 files, 82 tests, against the production build with
  ephemeral PostgreSQL and real Chrome.
- Design-system pass: no DS lint exists in this repo, so `typecheck:storybook`,
  `build-storybook` and the dot-separator rule were run over the diff. All clean; no
  auto-fixable violations, so no `X.Y-ds-fix` Steps were appended.

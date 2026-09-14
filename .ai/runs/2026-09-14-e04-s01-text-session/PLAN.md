# Execution plan — E04-S01, the text session

**Run:** `om-auto-create-pr-loop` (spec-implementation run, stacked multi-PR)
**Started:** 2026-09-14T09:05Z
**Issue:** [#26](https://github.com/open-mercato/ai_techleaders_project/issues/26)
**Spec:** `.ai/specs/2026-09-14-text-session.md`
**Umbrella branch:** `feat/e04-s01-text-session`
**Base of the stack:** `feat/epic-03-booking-and-payment` (PR
[#53](https://github.com/open-mercato/ai_techleaders_project/pull/53)) — **not** `master`;
`Booking` exists nowhere else yet.
**External skill URLs:** none supplied.

## Tasks

> Authoritative status table. `Status` is one of `todo`, `in-progress` or `done`. A Step's own
> commit flips its `Status` to `done`; the `Commit` column is filled with the short SHA by the
> next commit, since a commit cannot contain its own SHA. The first row whose `Status` is not
> `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are
> immutable once the plan is committed.

| Phase | Step | Title | Exec | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| 0 Umbrella | 0.1 | Spec + run folder on the umbrella branch | inline | done | 9b12b88 |
| 1 Design system | 1.1 | `SessionComposer` component, CSS, unit tests, export | inline | done | e1fe077 |
| 1 Design system | 1.2 | Composer + whole-screen Storybook stories for every window state | inline | done | de4bc9f |
| 1 Design system | 1.2-ds-fix | Say sessions are text once per screen (found by screenshot) | inline | done | aed0d61 |
| 2 Data & API | 2.1 | `SessionMessage` entity + `sessions` migration | inline | done | — |
| 2 Data & API | 2.2 | `message-create.schema.ts` validator | inline | todo | — |
| 2 Data & API | 2.3 | `session.service.ts` — window, party check, posting | inline | todo | — |
| 2 Data & API | 2.4 | `GET /api/sessions/[bookingId]` + `POST .../messages` | inline | todo | — |
| 2 Data & API | 2.5 | `QaSessionSeeder` + `npm run db:seed:sessions` | inline | todo | — |
| 3 Session screen | 3.1 | `useApiResource` gains a non-flashing `pollMs` | inline | todo | — |
| 3 Session screen | 3.2 | `session-screen.tsx` — DS composition, read-only | inline | todo | — |
| 3 Session screen | 3.3 | `/sessions/[bookingId]/page.tsx` + guard | inline | todo | — |
| 3 Session screen | 3.4 | "Open session" entry point in both sessions lists | inline | todo | — |
| 4 Composer | 4.1 | Wire the composer to `POST`, with delivery states | inline | todo | — |
| 4 Composer | 4.2 | Ended state points at the written answer (#27) | inline | todo | — |
| 4 Composer | 4.3 | Integration scenario — third-user refusal + the R03 line | inline | todo | — |

Legend: `todo` · `in-progress` · `done`. One Step = one commit. `Exec` is `inline` for
every Step: the stack's branches must be created and pushed in order, and a dispatched
executor cannot be trusted to keep four branches' parents straight.

## Sub-PRs (the umbrella's tracking table)

Each row is one reviewable, separately verifiable PR. They are **stacked**: each targets the
previous one, so each PR's diff is only its own work. Merge in order, top to bottom.

| # | PR | Branch | Base | Steps | How a human verifies it |
| --- | --- | --- | --- | --- | --- |
| U | [#54](https://github.com/open-mercato/ai_techleaders_project/pull/54) (umbrella) | `feat/e04-s01-text-session` | `feat/epic-03-booking-and-payment` | 0.1 | Read the spec; this table is the status board |
| 1 | _pending_ | `feat/e04-s01-session-ds` | `feat/e04-s01-text-session` | 1.1–1.2 | `npm run storybook` → Product/Session screen: every window state, no database |
| 2 | _pending_ | `feat/e04-s01-session-data` | `feat/e04-s01-session-ds` | 2.1–2.5 | `npm run db:migrate && npm run db:seed && npm run db:seed:sessions`, then the two routes |
| 3 | _pending_ | `feat/e04-s01-session-screen` | `feat/e04-s01-session-data` | 3.1–3.4 | Sign in as the seeded mentee/mentor → `/home` → "Open session" → the three states |
| 4 | _pending_ | `feat/e04-s01-session-composer` | `feat/e04-s01-session-screen` | 4.1–4.3 | Two browsers, both parties, post and watch it arrive; then the ended session |

PR numbers are filled in as each PR opens.

## Goal

At the slot's start the two parties of a confirmed booking hold a 25- or 50-minute text
session on one screen inside DevMentor, and every session screen says sessions are text.

## Scope

- **In:** the `sessions` concept — one table of messages, one service holding the window
  arithmetic and the party check, two routes, one screen for both roles, one design-system
  composer, a QA seeder, unit tests at 100% per file, one integration scenario.
- **Out (Non-goals):** video/audio in any form (N01); the written answer (#27); the session
  note (#28, #29); attachments, editing, deletion, receipts, typing indicators; push
  delivery of any kind (no websocket, no worker exists); per-message notifications;
  moderation and disputes (#32); any promise about answer speed (R14); operator access to a
  transcript.
- **Not touched:** every E03 file except the two sessions lists' action slots (Step 3.4).

## Phases

### Phase 0 — Umbrella (PR U)

**0.1** Write `.ai/specs/2026-09-14-text-session.md` and this run folder; commit both; open
the umbrella draft PR carrying this Tasks table and the sub-PR table.

### Phase 1 — Design system, verifiable in Storybook (PR 1)

The design system already ships `SessionHeader`, `SessionCard`, `SessionIsTextNotice`,
`SessionTranscript`, `WrittenAnswer` and `session-transcript.css`. Exactly one part is
missing, and one composition is unproven.

**1.1** `packages/ui/src/components/sessions/SessionComposer.tsx` — a labelled textarea, a
send button, a remaining-character count against a caller-supplied `maxLength`, an error
slot, a `pending` state, and a `closed` state that renders its reason instead of the
controls. Presentational only: no fetch, no clock, no window arithmetic. Styles extend
`session-transcript.css`. Unit tests cover every branch; exported from `ui/src/index.ts`.

**1.2** `SessionComposer.stories.tsx` (open / pending / error / at-the-cap / closed-before /
closed-after) and `SessionScreen.stories.tsx` — the whole screen composed from DS parts at
`not_started`, `open` and `ended`, plus the refused state. This is what makes Acceptance
criterion 7 true and gives manual QA something to look at before any database exists.

### Phase 2 — Data, service and API (PR 2)

**2.1** `SessionMessage`: `booking` (many-to-one, `restrict`), `author` (many-to-one `User`,
`restrict`), `body` text, `createdAt` from `baseProperties`; index on `(booking, createdAt)`;
a 4000-character check; generated migration with a verified `down`.

**2.2** `messageCreateSchema` — `body` trimmed, 1–4000, with the field error copy.

**2.3** `SessionService`: `window(booking, now)`, `getForParty(bookingId)` (confirmed only,
party only, returns the booking projection + messages + window), `postMessage(bookingId,
input)` (open only, cap at 500). Registered in `container.ts` and `cradle.ts`. Tests cover
both boundaries, the third user, the operator, every non-`confirmed` status, the two closed
windows and the cap.

**2.4** The two routes through `ownedAction` — no `role`, because both parties use the same
screen and the service is the ownership authority.

**2.5** `QaSessionSeeder` + `npm run db:seed:sessions`: three confirmed bookings between the
seeded mock mentee and mock mentor (in 30 minutes / open now / ended an hour ago, the open
one pre-seeded with two messages). A booking needs two hours of lead time, so **manual QA
cannot otherwise reach the open state at all**.

### Phase 3 — The session screen, read-only (PR 3)

**3.1** `useApiResource(path, { pollMs })` — refetch on an interval without re-entering
`loading`, so a 5-second poll does not blank the transcript. In the shared layer because
`AGENTS.md` forbids a hand-rolled fetch in a component.

**3.2** `session-screen.tsx` — `SessionHeader` + `SessionIsTextNotice` + `SessionTranscript`
with `isOwn` supplied from the server's `viewerUserId`, the window state driving the chip,
and a **closed** composer in every state (posting arrives in Phase 4).

**3.3** `/sessions/[bookingId]/page.tsx` — `requirePageSession` (no role: both parties use
it), `force-dynamic`, both branches tested, added to `coverage.include`.

**3.4** An "Open session" action on both sessions lists, shown only for a confirmed session
whose window has started, so a mentee and a mentor can actually reach the screen.

### Phase 4 — Posting (PR 4)

**4.1** Wire `SessionComposer` to `POST .../messages`: optimistic `sending`, `failed` with a
retry, reload on success, refusal messages from the server surfaced in the composer's error
slot.

**4.2** The ended session's composer states the reason and points at the written answer to
come (#27), without claiming it exists.

**4.3** `tests/integration/session.integration.test.ts` — a third signed-in user is refused;
the screen carries the R03 line; a party posts inside the window and the other party's next
poll shows it.

## Checkpoints

One checkpoint per sub-PR, because each sub-PR *is* the verification boundary the user asked
for. Phase 1 closes at two Steps rather than three; the checkpoint fires anyway, since the PR
it completes is the one a human is asked to open Storybook for.

| # | Fires after | Evidence |
| --- | --- | --- |
| 1 | Step 1.2 (PR 1) | `typecheck`, `lint`, unit coverage on the new component, Storybook screenshots |
| 2 | Step 2.5 (PR 2) | `typecheck`, `lint`, unit coverage, migration up + down against a real database |
| 3 | Step 3.4 (PR 3) | `typecheck`, `lint`, unit coverage, browser screenshots of the three window states |
| final | Step 4.3 (PR 4) | the full `validation.commands` gate + the full integration suite + browser evidence |

## Risks

- **Q18 is open.** The whole screen rests on its plain reading, recorded as an `[ASSUMPTION]`
  in the spec, the umbrella PR body and NOTIFY. A different answer from founder A deletes
  Phase 2's table and routes and Phase 3's page; Phase 1 survives either way.
- **The stack's base is an unmerged draft** (PR #53). A rebase or force-push there requires
  rebasing all five branches. No E03 file is modified except the two lists' action slots.
- **Five branches, one worktree.** Each Step commits on exactly one branch; the plan's Steps
  are ordered so a branch is never revisited after its successor is created.
- **Coverage is per-file and absolute.** Every file above lands with its `coverage.include`
  entry in the same commit; a page-level guard costs two tests per page by itself.
- Polling at 5 seconds is a visible delay in a live exchange. It is the honest maximum for a
  project with no websocket and no worker, and R14 already promises nothing about speed.

## Adopted / rejected external references

None were supplied (`--skill-url` absent), and none were fetched.

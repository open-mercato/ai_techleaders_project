# The text session (E04-S01)

Status: active, 2026-09-14. Epic [#10](https://github.com/open-mercato/ai_techleaders_project/issues/10);
story [#26](https://github.com/open-mercato/ai_techleaders_project/issues/26).
Depends on [#22](https://github.com/open-mercato/ai_techleaders_project/issues/22) (E03-S03),
which lives on `feat/epic-03-booking-and-payment` / PR
[#53](https://github.com/open-mercato/ai_techleaders_project/pull/53) and not yet on `master`.

This is the spec #26 records as owed (`--no-spec`). It covers **only** the session itself.
The written answer (#27) and the session note (#28, #29) get their own spec: they are the
same two parties and the same booking, but they are asynchronous artefacts with an approval
workflow, and folding them in here would put a note's state machine inside a document about
a 25-minute window.

## Problem and goal

A mentee can find a mentor, reserve a slot and pay for it (E03), and both parties then see
the session in a list — but the session itself does not exist anywhere. Nothing in the
repository holds the exchange. The mentee interviewed on 2026-08-20 wants an answer rather
than a course and said "text is fine, faster"; N01 rules out video and R03 requires every
session screen to say so.

The goal: at the slot's start the two parties of a confirmed booking can open one screen and
write to each other there for the booked 25 or 50 minutes. Nobody else can open it. When the
booked length has passed the session shows as ended and the composer closes, while the
transcript stays readable and the written answer (#27) is still to come.

## Non-goals

- **Video or audio, of any kind** (N01). Not a control, not a placeholder, not a "coming
  soon". R03's sentence is rendered by `SessionIsTextNotice` on every session screen.
- The **written answer** (#27) and the **session note** (#28, #29). The ended session points
  at where the answer will appear; it does not implement it.
- File attachments, images, message editing, message deletion, read receipts, typing
  indicators, reactions, threads. None are in the brief.
- Push delivery of any kind. **There is no websocket and no worker in this project**
  (`AGENTS.md`); the screen polls.
- Notifying a party that a message arrived while they were elsewhere. E03-S04's notification
  feed covers the booking; a per-message notification is not in the brief.
- Moderation, abuse reporting and quality disputes (E05-S03).
- Any promise about how soon an answer arrives (R14) — the notice says the opposite.
- Rate limiting per se. The message cap below is an integrity bound, not a throttle.

## Carried open question — Q18

> Where does the 25/50-minute text exchange take place: in a session screen inside DevMentor,
> or in a channel the mentor names, with only the written answer kept in the product?
> — open, owner founder A, "blocking before the session story is implemented".

This spec builds **Q18's plain reading — a session screen inside DevMentor** — and records
that as an `[ASSUMPTION]`, not a decision. The reasons for building rather than waiting:

- #26's own analysis names the plain reading as the thing to build, and every screen E02/E03
  shipped ("DevMentor makes no promise about how soon an answer arrives", the sessions lists,
  `SessionIsTextNotice`) already reads as if the session is in the product.
- The design system already ships the transcript (`SessionTranscript`, `session-transcript.css`),
  committed under E02's design handoff with #26 named in its own Storybook docs.
- **It is the reversible direction.** If founder A instead names an external channel, what is
  deleted is one page, one service, one table and two routes; the booking, the party check and
  the notice all stay, and the story shrinks to #27's written-answer screen. Building the
  external-channel variant first and then being told "in the product" would instead mean
  building this anyway.

The assumption is stated on the session screen's spec, in the PR body, and in the run's
NOTIFY log. It is not stated to the user as a decided fact.

## Approach

### One new concept folder, `sessions`

```
packages/db/src/entities/sessions/session-message.entity.ts   the exchange
packages/core/src/services/sessions/text-session.service.ts   window + party + posting
packages/core/src/validators/sessions/message-create.schema.ts
packages/app/src/app/api/sessions/[bookingId]/route.ts        GET  — the session
packages/app/src/app/api/sessions/[bookingId]/messages/route.ts POST — one message
packages/app/src/app/sessions/[bookingId]/page.tsx            the screen, both roles
packages/ui/src/components/sessions/SessionComposer.tsx       the DS composer
```

`Booking` is not changed. A session is not a second record of the booking — it is the set of
messages against it, plus a window computed from `startsAt` and `lengthMinutes`. There is no
`Session` entity and deliberately no `status` column for it: a stored session state would be
a copy of arithmetic that only a clock can answer, and a copy with no writer (no worker
exists) is a copy that is wrong for the whole session.

### The window is arithmetic, not state (R01, D01)

```
endsAt = startsAt + lengthMinutes
now <  startsAt              → not_started
startsAt <= now < endsAt     → open
now >= endsAt                → ended
```

Both boundaries are decided, and the decision is the same one twice: the named instant
belongs to the state it opens. At exactly `startsAt` the session is **open** — the slot the
mentee paid for starts then, and a screen that still said "not started" at the time printed
on it would be wrong about the product's own promise. At exactly `endsAt` the session is
**ended**: the booked length has elapsed, and 25 minutes must not mean 25 minutes and a tick.

The window is computed from the **server's** clock (`Clock` on the cradle), never the
browser's, which is a setting. The browser is told the state and the two instants; it renders
what it was told.

### Only a confirmed booking has a session

`pending`, `expired` and `cancelled` bookings have no session screen. A party who opens one
gets `NotFoundError` ("This session does not exist.") rather than an empty transcript,
because an unpaid hold is not a session anybody has (the same reading `sessionCardState`
already applies to the lists) and a cancelled session is not one to reopen.

### Who may open it, and what a stranger sees

The two parties are `booking.mentee` and `booking.mentorProfile.user`. Anybody else — signed
in or not, mentee, mentor or operator — is refused. **The operator is refused too**: E05's
dispute resolution (#32) is not this screen, and a private exchange that the platform can
read by holding a role is not the private exchange the brief describes.

The check is one place, `TextSessionService.getForParty`, and the route and page both go through
it. The page repeats the role-free `requirePageSession` guard for the reason every guarded
page in this app repeats it (a layout does not re-render on a client-side navigation), and
then the service decides the party question.

A non-party gets **403 `forbidden`**, not 404. The id in the address is a booking id the
caller already knows or guessed; refusing it plainly is the honest answer, and a 404 here
would be indistinguishable from the "not confirmed" case above, which is the one message a
legitimate party needs to be able to tell apart.

### Posting

`POST /api/sessions/{bookingId}/messages` with `{ "body": "…" }`, refused unless the window
is `open`:

| Window | Posting | Message |
| --- | --- | --- |
| `not_started` | refused, 409 | "This session has not started yet." |
| `open` | accepted | — |
| `ended` | refused, 409 | "This session has ended. The mentor's written answer comes next." |

`409` rather than `422`: the body is valid, the moment is wrong. The service re-reads the
clock at the write, so a screen left open across the end boundary cannot post through it, and
a post that races the boundary is decided by the server.

`body` is trimmed, 1–4000 characters after trimming. The cap is `MAX_SESSION_MESSAGES = 500`
per booking, refused with 409 beyond it; a 50-minute text session does not reach 500
messages, and an unbounded table behind an authenticated loop is not something to ship.

### The screen is a composition of design-system components

Nothing here draws its own boxes. The screen composes, in this order:

1. `SessionHeader` — state chip from the window, the counterpart's name, the schedule, and
   its `notice` slot carrying `SESSION_IS_TEXT_MESSAGE`.
2. `SessionIsTextNotice` — the R03 line, `tone="inline"`, for the record.
3. `SessionTranscript` — the message list, `isOwn` supplied by the caller (never inferred
   from a display name), with the composer in its `composer` slot.
4. `SessionComposer` (**new**) — the one missing part: a labelled textarea, a send button, a
   remaining-characters count, an error slot, and a `closed` state that renders the reason
   instead of the controls. It belongs in the design system rather than the page because the
   written answer (#27) and the note (#28) need the same control, and because a composer
   whose disabled reasons live in a page is a composer whose disabled reasons get copied.

Its states are exercised in Storybook — `SessionComposer.stories.tsx` for the control and
`SessionScreen.stories.tsx` for the whole screen at each window state — so the visual work is
verifiable with `npm run storybook` alone, before any database exists.

### Polling, and why it is in the shared layer

While the window is `open` the screen re-reads `GET /api/sessions/{bookingId}` every 5
seconds. The refresh must not flip the screen back to its loading state (a transcript that
blanks every 5 seconds is unusable), so `useApiResource` — the sanctioned fetch hook — gains
an optional `{ pollMs }` that refetches **without** entering `loading`. It is added there
rather than as a bespoke `useEffect` in the page because `AGENTS.md` forbids hand-rolled
fetch in a component, and because #27 and #29 will want the same thing.

Polling stops when the window is not `open`: an ended session cannot change, and a
not-started one is re-read when the party reloads or the composer opens.

### Manual QA needs seeded fixtures

A booking must start at least two hours ahead (`MIN_LEAD_MINUTES`), so **a session booked by
hand can never be open now**. Manual QA of the three window states therefore cannot be
reached through the product's own flow, and a QA that cannot reach a state does not verify
it.

`QaSessionSeeder` (run explicitly, never from `npm run db:seed`) plants three confirmed
bookings between the seeded mock mentee and mock mentor — one starting in 30 minutes, one
open now, one that ended an hour ago, the open one carrying two messages — so
`npm run db:seed:sessions` followed by a sign-in reaches every state in one step. It is a
separate seeder class precisely so the default seed's empty-list state stays what E03's
screens and integration tests expect.

### Where the code goes

| File | What decides |
| --- | --- |
| `db/entities/sessions/session-message.entity.ts` | the table, its index and its 4000-char bound |
| `core/services/sessions/text-session.service.ts` | window, party check, confirmed-only, posting rules, caps |
| `core/validators/sessions/message-create.schema.ts` | the body's shape at the HTTP boundary |
| `app/api/sessions/[bookingId]/route.ts` | nothing — it hands the id to the service |
| `app/api/sessions/[bookingId]/messages/route.ts` | nothing — schema in, service out |
| `app/sessions/[bookingId]/page.tsx` | that a signed-in caller reached it (guard repeat) |
| `app/sessions/[bookingId]/session-screen.tsx` | composition, `isOwn`, polling cadence, local send state |
| `ui/components/sessions/SessionComposer.tsx` | how a composer looks and says why it is closed |

`text-session.service.ts` is registered on the container and the typed `Cradle` as
`textSessionService`, like every other concept service. **Not `sessionService`** — that key is
already the auth service that issues the sign-in cookie, and two meanings of "session" on one
cradle is a bug waiting for whoever autocompletes the wrong one. "Text session" is the
product's own word for this (R03), so the longer name is not a suffix invented to dodge a clash.

## Acceptance criteria

1. **Given** a confirmed booking, **when** its start time arrives, **then** both parties can
   open `/sessions/{id}` and post text there, and each sees the other's messages within one
   poll interval. (R01; rests on Q18's plain reading, `[ASSUMPTION]`)
2. **Given** any session screen, **when** it renders, **then** it states that the session is
   text and offers no audio or video control anywhere on the page. (R03, N01, negative)
3. **Given** the booked length, **when** 25 or 50 minutes have passed since the start,
   **then** the session shows as ended, the composer is closed with that reason, the
   transcript stays readable, and the screen points at the written answer still to come.
   (R01, D05)
4. **Given** a user who is neither party — including an operator — **when** they open the
   session's address, **then** they are refused (403) and no message is disclosed.
5. **Given** a booking that is not `confirmed`, **when** a party opens its session, **then**
   it does not exist (404), rather than presenting an empty session.
6. **Given** a post that arrives before the start or after the end, **when** the server
   decides it, **then** it is refused (409) with the reason, and nothing is stored.
7. **Given** the three window states, **when** a reviewer runs `npm run storybook`, **then**
   each state is visible as a story without a database.
8. Unit coverage is 100% (statements, branches, functions, lines) on every production file
   this spec adds, each listed in `coverage.include`; an integration scenario proves the
   third-user refusal and the R03 line in a real browser against a real database.

## Risks and open questions carried

- **Q18 is open** (above). The `[ASSUMPTION]` is the largest single risk in this spec: a
  different answer deletes the page, the service, the table and the two routes.
- **The stack is based on an unmerged branch.** `Booking` exists only on
  `feat/epic-03-booking-and-payment` (PR #53, draft, in progress). If that branch is rebased
  or force-pushed, this stack must be rebased onto it; if E03's `Booking` shape changes, the
  service's reads change with it. No E03 file is modified by this spec, which keeps the
  conflict surface to the two sessions lists' action slots.
- **Polling is a compromise, stated as one.** Five seconds is a visible delay in a live
  exchange. It is what a project with no websocket and no worker can honestly offer, and the
  notice already tells both parties that DevMentor promises nothing about speed.
- **`BACKWARD_COMPATIBILITY.md`** §3 (new `session_messages` table) and §1 (two new routes,
  one new page). Additive; no existing contract changes.
- An operator cannot read a session, by decision. When #32's dispute resolution needs
  evidence, it needs a recorded decision about disclosure first — not a role check added here.

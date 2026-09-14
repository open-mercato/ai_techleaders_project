# Final gate — every Step done (PR 4 closes the stack)

**When:** 2026-09-14T10:05Z
**Steps covered:** the whole plan (0.1 through 4.3)
**Branch:** `feat/e04-s01-session-composer`

## The full `validation.commands` gate

| Command | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | ✅ clean | `final-gate-artifacts/typecheck.log` |
| `npm run typecheck:storybook` | ✅ clean | same file |
| `npm run lint` | ✅ 0 errors, 1 pre-existing `<img>` warning in `prototypes/` | `final-gate-artifacts/lint.log` |
| `npm run test` (`test:unit`) | ✅ 2282 tests | — |
| `npm run test:unit:coverage` | ✅ **100%** statements (3595), branches (1997), functions (1015), lines (3362) | `final-gate-artifacts/unit-coverage.log` |
| `npm run build` | ✅ | `final-gate-artifacts/build.log` |

Every production file this story adds carries its own `coverage.include` entry and is at 100%
on all four metrics individually — the entity, the validator, the service, the two routes, the
shared param helper, the seeder, the DS composer, the screen, the page, the layout, the two
action modules and the polling hook.

## Integration suite

Run with the repository's own harness (Testcontainers PostgreSQL + a production build of the
app on an ephemeral port). Log: `final-gate-artifacts/integration-session-scenarios.log`.

| Scenario | Result |
| --- | --- |
| **TC-SESSION-001** — the two parties hold the session and nobody else can | ✅ **passed** |
| **TC-SESSION-002** — the screen says sessions are text and offers no call | ❌ **could not run here** |

TC-SESSION-001 passed against the real app and a real ephemeral database: the mentee reads the
window the server computed (`endsAt − startsAt` exactly 50 minutes), the mentor answers inside
it, the mentee's next read shows the answer, each side sees the other named as the counterpart
over the same message ids, a third signed-in user **who also holds `operator`** is refused 403
on both read and post with no message text in the response, a signed-out read is 401, and a
post after the end is refused 409 with nothing stored.

TC-SESSION-002 fails on this machine for one reason, and the log records it verbatim:

```
✗ Auto-launch failed: Chrome exited early (exit code: 127) without writing DevToolsActivePort
  chrome: error while loading shared libraries: libnspr4.so: cannot open shared object file
```

The harness launches its own `agent-browser` Chrome; the fix is
`npm run test:browser:install:ci` (`agent-browser install --with-deps`), which installs system
packages and needs root, and `sudo` is refused in this environment. **The assertions were never
reached**, so this is not a result about the screen — and the same ground is covered manually
below and in checkpoint 3. CI installs the browser runtime and runs both scenarios.

## The rest of the wider suite

Not re-run in full here: the other integration files exercise E01/E02/E03 surfaces this story
does not change, and they need the same browser runtime. CI runs Build, Lint, Unit tests and
Integration tests independently on every pull request.

## UI verification — posting, in a real browser, against a real database

Production build + the seeded fixtures; screenshots through `agent-browser connect 9333`
against a `chromedp/headless-shell` container this run started (`dm-e04-chrome`) because the
bundled Chrome cannot start.

| File | What it proves |
| --- | --- |
| `01-open-composer-empty.png` | Open session, composer ready, Send disabled while empty, count at 4,000 |
| `02-composer-typed.png` | Typing enables Send and the count moves |
| `03-message-sent.png` | The message is on screen as **Sent**, on the viewer's side, and the box is empty again |
| `04-poll-brought-the-reply.png` | **The mentor's reply arrived with no navigation and no reload** — the 5-second poll brought it in and the transcript did not blank. This is acceptance criterion 1, in the product |
| `05-ended-composer-closed.png` | Ended: transcript readable, composer replaced by the reason, pointing at the written answer |
| `06-not-started-composer-closed.png` | Before the start: Upcoming, and the reason in place of the controls |

The mentor's reply in `04` was posted through the API as the mentor while the mentee's browser
sat untouched on the page, which is why it is evidence about polling rather than about a click.

## Design-system / style pass

No separate tooling exists in this repository beyond `lint` and `typecheck:storybook`, both
green. The style rules that do have a home were checked by hand and in tests:

- Every session screen carries R03's sentence **exactly once** (asserted in
  `session-screen.test.tsx`); the duplicate the checkpoint-1 screenshots caught is fixed.
- No audio or video control anywhere — asserted as a negative on *controls*, since R03's own
  sentence contains the words.
- No dot or middle dot as an inline separator (asserted on the schedule label).
- The composer's footer puts its action at the trailing edge, after the count the party reads
  before pressing it.
- Every new component has Storybook coverage, and the whole screen has a composition story.

## Acceptance criteria

| # | Criterion | Where it is proven |
| --- | --- | --- |
| 1 | Both parties open the session at the start and exchange text | TC-SESSION-001 ✅ and `04-poll-brought-the-reply.png` |
| 2 | Every session screen says it is text and offers no video or audio | `session-screen.test.tsx` negative assertions, checkpoint-3 screenshots, TC-SESSION-002 (CI) |
| 3 | After the booked length the session shows ended, transcript stays, answer comes next | `05-ended-composer-closed.png`, service tests at both boundaries, TC-SESSION-001 ✅ |
| 4 | A user who is neither party — including an operator — is refused | TC-SESSION-001 ✅ (403, no text leaked), `07-third-user-refused.png` in checkpoint 3 |
| 5 | A booking that is not confirmed has no session (404) | service tests for `pending`/`expired`/`cancelled`, checkpoint-2 transcript ✅ |
| 6 | A post outside the window is refused with its reason and nothing stored | TC-SESSION-001 ✅ (409), service tests, checkpoint-2 transcript |
| 7 | Every window state visible in Storybook without a database | checkpoint-1 screenshots, `product-session-screen--*` stories |
| 8 | 100% unit coverage per file + an integration scenario | above; the browser half of the scenario runs in CI |

## Carried risks, unchanged

- **Q18 is open** (owner founder A). The whole stack is its plain reading, recorded as an
  `[ASSUMPTION]`. PR #56 is the expensive half to reverse (one table).
- The stack is based on the unmerged draft PR #53; all five branches retarget to `master` once
  it merges, and a force-push there means rebasing all five.
- Polling at five seconds is a visible delay. It is the honest maximum for a project with no
  websocket and no worker, and R14 promises nothing about speed.

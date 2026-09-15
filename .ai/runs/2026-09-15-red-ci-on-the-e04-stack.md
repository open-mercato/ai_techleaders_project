# Red CI across the open E04 pull request stack

Date: 2026-09-15
Status: complete
Skill: `om-auto-fix-pr` (all open PRs with failing CI)
PRs: #54, #55, #56, #57, #58

## What was requested

Go through every open pull request with failing CI and fix the failures at root cause.

## What was failing

Five of the seven open PRs were red, all of them in the stacked E04 text-session set
(#54 → #55 → #56 → #57 → #58, each based on the one below it, #54 based on
`feat/epic-03-booking-and-payment`):

| PR | Failing check | Failing test |
| --- | --- | --- |
| #54 | Unit tests, Integration tests | `MentorProfileEditor`, `migrations.integration` ×2 |
| #55, #56, #57 | Integration tests | `migrations.integration` ×2 |
| #58 | Integration tests | `migrations.integration` ×2, `session.integration` |

Three distinct causes, none of them a product defect.

### 1. The stack never merged its base back in — `migrations.integration` ×2, all five PRs

`feat/e04-s01-text-session` branched from `feat/epic-03-booking-and-payment` eleven
commits before that branch's review fixes landed, and nothing merged the base back down
the stack afterwards. One of the commits it was missing is the fix for
`migrations.integration.test.ts`, whose "rolls back only prices" case called
`migration:down` with **no target**. That reverts whatever migration happens to be last,
which stopped being `mentor_prices` the moment E03 added five migrations after it — so the
rollback reverted `payout-held-notification` instead, the price columns were still there,
and the *next* test ("matches the complete entity model") then failed on a schema-drift
diff that pointed at a notification CHECK constraint rather than at the test that had
moved the schema out from under it.

Fixed by merging each branch's base into it, bottom-up, so every PR is judged against the
diff it will actually merge. No code change was needed: the repair already existed on the
base.

### 2. A positive control that named a control which does not exist — `session.integration`, #58

`TC-SESSION-002` asserts that no **link** on the text session screen opens a call, and
`expectAbsent` requires a positive control so that absence is evidence rather than a page
that failed to load. The control it named was `link "Sign out"`. Sign out is a
`WorkflowAction` **button** here and on every other screen (`SignOutAction`), which every
other integration test already spells `button "Sign out"`, so the control could never be
satisfied and the assertion threw on its own guard before it ever looked for a call link.
The screen itself was fine — the accessibility tree in the failure output shows the
transcript, the composer and no call control.

Now proven with `link "My sessions"`, the workspace navigation link that genuinely is on
that screen; the ended screen's textbox assertion keeps Sign out with its real role.

### 3. A focus assertion racing a passive effect — `MentorProfileEditor`, #54

Reproduced locally at roughly one run in nine. The test submits the profile form, awaits
the server-side field error's text with `findByText`, then asserted
`document.activeElement` synchronously. React renders that text during the commit;
`CrudForm` moves focus from a `useEffect`, which React flushes after the commit — so the
assertion can run before the focus effect has run at all. Instrumenting both sides showed
the assertion firing first and the focus landing correctly afterwards, which ruled out the
plausible-looking alternative (focus aimed at a still-disabled fieldset).

Now `await waitFor(() => expect(document.activeElement).toBe(group))`, matching the two
other async focus assertions in the repo. The synchronous sibling assertions are correct as
they stand, because `act` flushes effects before a `fireEvent` call returns.

## Files touched

- `packages/ui/src/components/mentors/MentorProfileEditor.test.tsx` (#54)
- `.ai/lessons.md` (#54, #58)
- `tests/integration/session.integration.test.ts` (#58)
- Merge commits bringing each PR up to date with its base (#54 … #58)

## Outcome

No production code changed: every failure was a test that had gone stale or that asserted
on a state it had not waited for. Nothing was skipped, loosened or deleted to reach green.

## Follow-ups

- #52 and #53 conflict with `master`. Their checks are green but were last computed on
  2026-09-14, before `master` advanced, so they are stale rather than trustworthy. #53 is
  the base of this whole stack; resolving it (a one-hunk `.ai/lessons.md` index conflict)
  and letting the merge flow up the stack again is the next step.
- Integration tests could not be reproduced locally on this machine — Testcontainers needs
  Docker, which is unavailable here. Causes 1 and 2 were diagnosed from the CI logs and the
  code; CI is the verification.

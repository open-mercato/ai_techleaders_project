# Backlog — .ai/specs/product-brief.md, filed 2026-09-03

Tracker: https://github.com/open-mercato/ai_techleaders_project (GitHub). Filed by `om-backlog` through `om-prepare-issue`; the tracker is the authority and this file is the map from tree ids to issue numbers for humans and for the next run. Ids in titles (`E01-S02 — …`) are the durable link on re-runs.

| Id | Issue | Title | Epic | Depends on | Adopted | Iteration |
|---|---|---|---|---|---|---|
| E01 | [#7](https://github.com/open-mercato/ai_techleaders_project/issues/7) | Accounts and roles |  |  | no |  |
| E01-S01 | [#12](https://github.com/open-mercato/ai_techleaders_project/issues/12) | A developer or invited mentor signs in with GitHub and lands in their role's home | #7 |  | no | first (D13) |
| E01-S02 | [#13](https://github.com/open-mercato/ai_techleaders_project/issues/13) | A user without GitHub signs in with email and password | #7 | E01-S01 (#12) | no | first (D13) |
| E01-S03 | [#14](https://github.com/open-mercato/ai_techleaders_project/issues/14) | A signed-in user sees only their role's screens; the operator role belongs to the two founders | #7 | E01-S01 (#12) | no | first (D13) |
| E02 | [#8](https://github.com/open-mercato/ai_techleaders_project/issues/8) | Mentors become bookable |  |  | no |  |
| E02-S01 | [#15](https://github.com/open-mercato/ai_techleaders_project/issues/15) | An invited senior engineer accepts the invitation and gets a mentor account; there is no open registration | #8 | E01-S01 (#12) | no | first (D13) |
| E02-S02 | [#16](https://github.com/open-mercato/ai_techleaders_project/issues/16) | A mentor fills the mentor page (public-work link, description, stack tags) and gets a share link; no ratings | #8 | E02-S01 (#15) | no | first (D13) |
| E02-S03 | [#17](https://github.com/open-mercato/ai_techleaders_project/issues/17) | A mentor publishes slots and sees them taken as they are booked | #8 | E02-S01 (#15) | no | first (D13) |
| E02-S04 | [#18](https://github.com/open-mercato/ai_techleaders_project/issues/18) | A mentor sets 25- and 50-minute prices within the operator's bounds | #8 | E02-S01 (#15) | no | first (D13) |
| E02-S05 | [#19](https://github.com/open-mercato/ai_techleaders_project/issues/19) | A mentor completes Stripe Connect onboarding and sees whether payouts are enabled | #8 | E02-S01 (#15) | no | 1.1 (D13) |
| E02-S05-T01 | [#33](https://github.com/open-mercato/ai_techleaders_project/issues/33) | Stripe Connect integration | #19 | E03-S03-T01 (#34) | no | 1.1 (D13) |
| E03 | [#9](https://github.com/open-mercato/ai_techleaders_project/issues/9) | Booking and payment |  |  | no |  |
| E03-S01 | [#20](https://github.com/open-mercato/ai_techleaders_project/issues/20) | A mentee finds a mentor in a list filtered by stack tag, ordered by most recent published availability; no search, no ranking | #9 | E02-S02 (#16), E02-S03 (#17) | no | 1.1 (D13) |
| E03-S02 | [#21](https://github.com/open-mercato/ai_techleaders_project/issues/21) | A mentee picks a slot that starts at least two hours ahead and a 25- or 50-minute length at the mentor's price | #9 | E02-S03 (#17), E02-S04 (#18), E01-S01 (#12) | no | first (D13) |
| E03-S03 | [#22](https://github.com/open-mercato/ai_techleaders_project/issues/22) | A mentee pays through Stripe Checkout; the booking is confirmed only after payment; booking-to-start is recorded | #9 | E03-S02 (#21) | no | first (D13) |
| E03-S03-T01 | [#34](https://github.com/open-mercato/ai_techleaders_project/issues/34) | Stripe Checkout integration | #22 |  | no | first (D13) |
| E03-S04 | [#23](https://github.com/open-mercato/ai_techleaders_project/issues/23) | The mentor and the mentee are told about a confirmed booking and each sees their upcoming sessions | #9 | E03-S03 (#22) | no | first (D13) |
| E03-S05 | [#24](https://github.com/open-mercato/ai_techleaders_project/issues/24) | A mentee cancels free up to 24 hours before a session; a later cancellation forfeits the fee | #9 | E03-S03 (#22) | no | 1.1 (D13) |
| E03-S06 | [#25](https://github.com/open-mercato/ai_techleaders_project/issues/25) | DevMentor keeps 20% of a paid session and the mentor's share is paid out through Stripe Connect | #9 | E03-S03 (#22), E02-S05 (#19) | no | 1.1 (D13) |
| E04 | [#10](https://github.com/open-mercato/ai_techleaders_project/issues/10) | Session, written answer, and note |  |  | no |  |
| E04-S01 | [#26](https://github.com/open-mercato/ai_techleaders_project/issues/26) | At the slot's start the mentee and the mentor hold a 25- or 50-minute text session in DevMentor; every session screen says sessions are text | #10 | E03-S03 (#22) | no | first (D13) |
| E04-S02 | [#27](https://github.com/open-mercato/ai_techleaders_project/issues/27) | The mentor gives the written answer and the mentee sees it after the session | #10 | E04-S01 (#26) | no | first (D13) |
| E04-S03 | [#28](https://github.com/open-mercato/ai_techleaders_project/issues/28) | The mentor drafts a session note and the mentee sees it awaiting approval | #10 | E04-S02 (#27) | no | first (D13) |
| E04-S04 | [#29](https://github.com/open-mercato/ai_techleaders_project/issues/29) | The mentee approves the note in full or declines it with a comment; an approved note is kept privately by both; nothing is published | #10 | E04-S03 (#28) | no | first (D13) |
| E05 | [#11](https://github.com/open-mercato/ai_techleaders_project/issues/11) | Operator functions in 1.0 |  |  | no |  |
| E05-S01 | [#30](https://github.com/open-mercato/ai_techleaders_project/issues/30) | The operator invites a senior engineer from the beachhead pool in a batch of 20 and sees who published a slot within two weeks | #11 | E01-S03 (#14) | no | 1.1 (D13) |
| E05-S02 | [#31](https://github.com/open-mercato/ai_techleaders_project/issues/31) | The operator sets the price bounds and the platform fee | #11 | E01-S03 (#14) | no | 1.1 (D13) |
| E05-S03 | [#32](https://github.com/open-mercato/ai_techleaders_project/issues/32) | The operator resolves a quality dispute and records the outcome; no automatic refund | #11 | E03-S03 (#22) | no | 1.1 (D13) |

For the two tasks (`E02-S05-T01`, `E03-S03-T01`) the Epic column holds the parent story.

## Not filed

- E06 — Later (parked): publishing approved notes into a vault (the founders' E04-S04, E04-S05), vault subscriptions and single-note purchase (their E05), MCP access with every answer citing the mentor and the note, R11/D15 (their E10), team plans, async Q&A, transcription and AI note drafting. No vault story is written before the E00-T03 readout on 2026-11-30 (D25); D14 decides whether any of this returns. Ideas with no decision behind them (a DevMentor membership, Mentor Pro, session packs, featured placement, a premium vault-plus-AI tier) stay ideas. Non-goals bounding everything above: N01 "Video calls" (owner founder A) and N02 "A ratings or reviews profile" (owner founder A).
- The collection plan's five entries (E00-T01 benchmark, E00-T04 frequency data, mentee interviews, mentor-decliner interviews, E00-T03) were not filed; the research variant would file them as tasks under `E00 — Discovery` on request.

## Dedupe

- 59 `search-issues` queries (id prefixes plus two or three phrasings per epic and story) and one `search-prs` sweep on 2026-09-03 returned nothing; the repository had no issues before this run, so no issue was adopted.

## Labels

- Applied by `om-prepare-issue` through the tracker guards on every issue: `feature` (epics and stories) or `dependencies` (the two tasks), `priority-medium` on all 28, `risk-high` or `risk-medium` per the table's source issue; one `🤖 om-prepare-issue — 🏷️ label rationale` comment per issue explains the set.

## Open questions carried on issues

- Q18 (where the text exchange lives) on E04-S01 (#26), blocking before implementation, owner founder A.
- Q19 (first-iteration payouts) on E02-S05 (#19) and E03-S06 (#25), blocking before the first payout falls due, owner founder A with founder B.
- Q20 (mentor-page visits for D17's check) on E03-S01 (#20), blocking before 2026-11-28, owner founder A with founder B.
- Mentee vs `student` naming on E01-S01 (#12), non-blocking, decide once.

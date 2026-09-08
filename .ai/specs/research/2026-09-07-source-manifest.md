# DevMentor: input for om-discover, packed 2026-09-07

What this is: the material Oliwia hands over before anyone runs `om-discover`. Only what existed before the skill: interviews, the board exported frame by frame, the Discord export and survey, the benchmark checks, the mentor list, and the two decisions the workshop made. Nothing the skill writes is here.

Not included, on purpose: `product-brief.md` (the skill writes it), `research/decisions/` except N01 and N02 (the other 26 records came out of om-discover rounds), `research/templates/` (the skill hands them out), the test support export from 25 August (test data, replaced by the real Discord export), and the payout data request (it answers a question the skill raised). Where a board export carried a note pointing at a later decision, that note is removed in this copy; the fixture keeps the full version.

How to use it, from an empty folder:

```
mkdir -p ~/Documents/devmentor-clean && cd ~/Documents/devmentor-clean && unzip -q ~/Documents/devmentor-om-discover-input-2026-09-07.zip && git init -q && git add -A && git commit -q -m "Research material for discovery" && claude
```

Then, in Claude Code: `/om-discover "DevMentor" --mode own --quick`

Files (33):

- .ai/agentic.config.json
- .ai/specs/research/2026-08-20-interview-working-dev.md
- .ai/specs/research/2026-08-22-interview-mentor.md
- .ai/specs/research/2026-08-26-workshop-export.md
- .ai/specs/research/2026-09-01-interview-backend-dev-fintech.md
- .ai/specs/research/2026-09-02-interview-freelancer-react.md
- .ai/specs/research/2026-09-02-interview-platform-dev-solves-alone.md
- .ai/specs/research/2026-09-02-miro-board-competitors-benchmark.md
- .ai/specs/research/2026-09-02-miro-board-journey-current-state.md
- .ai/specs/research/2026-09-02-miro-board-product-goals.md
- .ai/specs/research/2026-09-02-miro-board-revenue-costs-channels.md
- .ai/specs/research/2026-09-02-miro-board-vision-target-needs.md
- .ai/specs/research/2026-09-02-miro-board-vpc-dev.md
- .ai/specs/research/2026-09-02-miro-board-vpc-mentor.md
- .ai/specs/research/2026-09-03-interview-senior-python-meetups.md
- .ai/specs/research/2026-09-03-interview-staff-engineer-declined-before.md
- .ai/specs/research/2026-09-04-benchmark-adplist.md
- .ai/specs/research/2026-09-04-benchmark-codementor.md
- .ai/specs/research/2026-09-04-benchmark-mentorcruise.md
- .ai/specs/research/2026-09-04-benchmark-preply.md
- .ai/specs/research/2026-09-04-benchmark-topmate.md
- .ai/specs/research/2026-09-04-data-request-discord-help.md
- .ai/specs/research/2026-09-04-discord-help-requests.csv
- .ai/specs/research/2026-09-04-mentor-list-note.md
- .ai/specs/research/2026-09-04-mentor-list.csv
- .ai/specs/research/2026-09-04-miro-board-benchmark-tables.md
- .ai/specs/research/2026-09-04-miro-board-journey-future-state.md
- .ai/specs/research/2026-09-04-miro-board-stakeholders.md
- .ai/specs/research/2026-09-04-survey-discord-willingness-to-pay.md
- .ai/specs/research/2026-09-05-miro-board-raci-matrix.md
- .ai/specs/research/decisions/N01-no-video.md
- .ai/specs/research/decisions/N02-no-ratings.md
- README.md

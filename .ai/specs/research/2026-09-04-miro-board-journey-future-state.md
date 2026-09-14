# Discovery board (Miro), future-state journey: developer with DevMentor. Exported 2026-09-04 by founder A (Oliwia)

Document type: the founders' target journey for a developer using DevMentor, written on the board in Polish before the scope decisions; a hypothesis about the full vision, not a description of 1.0. Nine stages, six rows (goal, actions, touchpoints, thoughts, emotions, what DevMentor does). Thoughts are the founders' wording, kept in Polish. The current-state journey is in `2026-09-02-miro-board-journey-current-state.md`.

Conflicts with recorded decisions, so the brief does not read this as scope:

- "Zapytaj vault" (ask the vault from the IDE over MCP), "Async Q&A" with a 24h SLA, "Dashboard, vault, MCP" after the session: the vault, MCP and async Q&A are later (D05), returning only after the E00-T03 readout (D25).
- "Czyta profil, opinie" and "porównywalne profile, opinie": ratings and reviews are excluded (N02).
- "Meet / Zoom" as the session touchpoint: no video (N01); 1.0 sessions are text in a session screen inside DevMentor (D27).
- "Udostępnia ekran i kod": screen sharing is not in 1.0; the mentee pastes what they are allowed to share (D26).
- "Spokój (SLA 24h)": no response-time promise in 1.0 (D22).

| Stage | Goal | Action | Touchpoint | Thought | Emotion | What DevMentor does |
|---|---|---|---|---|---|---|
| Problem | understand the problem | checks code and docs | IDE, GitHub | "Czy czegoś nie przeoczyłem?" | frustration | entry through the coding agent, no Google search |
| Ask the vault (later, D05) | get an answer without waiting | asks the mentor's vault from the IDE over MCP | IDE / coding agent (MCP) | "Może to już jest opisane?" | hope | an answer with citations from the notes; escalation when there is none |
| Finding a mentor | find the right expert | types the problem, filters by technology and availability | DevMentor search | "Kto zna dokładnie ten problem?" | focus | one search instead of Slack, Discord and LinkedIn |
| Judging the mentor | assess competence | reads the profile, reviews, vault size, response time | mentor profile | "Czy widzę, że ta osoba to robiła?" | trust | comparable profiles, reviews (N02 conflict), vault, SLA |
| Contact | sharpen the need | leaves an async question or sends a message | async Q&A, messages | "Czy odpowie do jutra?" | calm (24h SLA) | async question with a time guarantee; the mentor has context from the session |
| Scheduling | book a slot | picks a 25/50-minute slot in the mentor's calendar | booking flow | "Czy zdążymy przed release'em?" | control | mentor's calendar, time zones, no message ping-pong |
| Payment | pay safely | pays at checkout, one amount | checkout | "Ile to naprawdę kosztuje?" | certainty | clear price, reschedule and cancel in the system |
| Session | solve the problem | shares screen and code | Meet / Zoom (N01 conflict) | "Czy dobrze wyjaśniłem kontekst?" | relief | the mentor sees the topic and the PR link before the session |
| After the session | keep the solution | approves the session note, has it in the vault | dashboard, vault, MCP | "Gdzie to znajdę za miesiąc?" | satisfaction | note in the vault, session history, feedback in one place |

What survives into 1.0 from this table: entry with a concrete problem, finding a mentor by stack, the mentor seeing the question before the session (D27, the mentor interviews), a 25 or 50-minute slot, one clear price paid up front, reschedule and cancel in the product, a note approved by the mentee and kept privately by both (D20). Everything in the "later" column is the second half of the vision (A01), tested by E00-T03.

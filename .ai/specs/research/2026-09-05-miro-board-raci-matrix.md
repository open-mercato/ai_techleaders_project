# Discovery board (Miro), RACI matrix. Exported 2026-09-05 by founder A (Oliwia)

Document type: the founders' assignment of who does what, made on the board on 2026-09-05. It replaces the reading in `2026-09-04-miro-board-stakeholders.md` that the frame carried no R/A/C/I. Roles, not people: today the sponsor, product owner and UX/UI columns are founder A and the project manager, tech lead and developer columns are founder B (D19). QA and legal have no person behind them yet.

Legend from the board: R responsible (does the work), A accountable (one person, answers for the result), C consulted (asked before the decision), I informed (told after).

| Activity | Sponsor | Product Owner | Project Manager | Tech Lead | UX/UI | Developers | QA | Legal |
|---|---|---|---|---|---|---|---|---|
| Define business goal and success metrics | A | R | C | I | C | I |  | I |
| Approve MVP scope | A | R | C | C | C | I | I |  |
| Discovery and user interviews | I | C | I |  | A, R | I |  |  |
| Design the mentor booking flow |  | C | I | C | A, R | C | C |  |
| Define the payment and commission model | C | A, R | I | C | C | I |  | C |
| Technical architecture decisions | I | C | I | A, R |  | C | I |  |
| Implement booking and payments |  | I | I | C | I | A, R | C |  |
| Test business rules and edge cases |  | I | I | C | I | C | A, R |  |
| Terms of service and data processing | C | C | I | I | I |  |  | A, R |
| Release go / no-go | A | R | R | C | I | I | C | I |

Reading notes for the brief:

- Every row has exactly one A, so the matrix holds as a RACI.
- Release go / no-go gives QA a C. `SDLC.md` makes QA a gate: a PR with needs-qa does not merge without qa-approved, pinned to a commit. On this matrix that is at least an R for QA in the release row, or a separate row "QA sign-off" with QA as A, R. To reconcile.
- Discovery and user interviews leaves the tech lead blank. Founder B ran two of the seven interviews (2026-09-02 platform developer, 2026-09-03 senior Python) and the Discord export; as tech lead that is an R, or at least a C.
- Terms of service and data processing has legal as A, R and nobody in that role. The first build needs terms for both roles (MoSCoW, Must), so until someone owns legal, founder A is the A by default.
- Finance is on the stakeholder list and not on the matrix. Payment and commission has legal as C; whoever settles payouts and refunds (the operator, D19) has no column.

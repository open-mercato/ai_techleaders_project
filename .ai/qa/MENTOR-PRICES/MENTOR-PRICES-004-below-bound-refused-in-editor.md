# TC-MENTOR-PRICES-004: A price below the bound is refused in the editor, showing the allowed range

**Implementation:** [`tests/integration/mentor-prices.integration.test.ts`](../../../tests/integration/mentor-prices.integration.test.ts), `describe('TC-MENTOR-PRICES-004 a price below the bound in the editor')`

| Field | Value |
| --- | --- |
| Test ID | TC-MENTOR-PRICES-004 |
| Category | Mentor prices / validation (UI) |
| Priority | Medium |
| Type | UI (agent-browser), with a database assertion |
| Persona | Signed-in mentor (`mock-mentor`) |
| Spec | `.ai/specs/2026-09-08-mentor-prices.md`, acceptance criterion "out of bounds refused, bound shown". The API refusal for all four breaches is TC-MENTOR-PRICES-001. |

## Prerequisites

Fixture `seedPublishedMentorProfile`, then prices set to 100.00 and 200.00 through `PUT /api/mentors/me/prices`. Cleanup: `resetPublishedMentorProfile`, then close the browser session.

## Steps

| # | Step | Expected result (observed) |
| --- | --- | --- |
| Given | Mentor opens `/mentor/prices` | The page shows `textbox "25-minute price"` with the value 100.00 and the help text `Allowed range: PLN 90.00 to PLN 600.00. Currency: PLN.` |
| When | Mentor enters `89.99` as the 25-minute price and clicks **Save prices** | The server refuses the save. The format is valid, so the client-side schema lets it through. |
| Then | The bound is shown on the refused field | Exactly one `[role="alert"]` appears, with the text `Enter an amount from PLN 90.00 to PLN 600.00.` The only control with `aria-invalid="true"` is `name="price25"`. `Session prices saved.` does not appear. |
| Then | Stored prices are unchanged | `price25Cents = 10000`, `price50Cents = 20000`. |

Screenshot: `test-results/integration/mentor-prices-below-bound.png`.

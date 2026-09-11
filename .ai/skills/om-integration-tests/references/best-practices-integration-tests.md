# Integration-scenario best practices (DevMentor)

Adapted from the user-provided `best-practices-testow-integracyjnych.md` (2026-09-11,
original in `~/Downloads/`, outside the repo — committed here so the rule set does not
depend on a file that lives on one machine). Source language: Polish; content below is
the English rule set the skill applies, mapped onto this repo's stack (Vitest unit
tests, Testcontainers + agent-browser integration tests, `TC-{AREA}-{NNN}` scenario
IDs, `.ai/qa/` scenario docs).

These rules govern both the authored `*.integration.test.ts` file and its paired
`.ai/qa/{AREA}/{AREA}-{NNN}-{slug}.md` scenario. Apply them whenever authoring a new
scenario (skill step 4 onward); they refine, not replace, the skill's own step
instructions and `references/rules.md`.

1. **Test behavior, not implementation.** State the outcome visible to a user or
   another system ("the order status becomes Paid"), never an internal call
   ("`updateOrderStatus()` was called once"). Implementation-detail assertions break
   on a correct refactor.
2. **One scenario, one business case.** A scenario may have several steps but exactly
   one purpose. Don't fold cancellation, refund, and invoice download into the same
   `TC-*` — give each its own file.
3. **Structure the scenario as Given–When–Then.** Given = starting state, When = the
   action under test, Then = the expected result. Use this structure in both the
   markdown scenario's step table and the test's arrange/act/assert shape.
4. **Scenarios and tests must be deterministic.** No unseeded random data, no
   dependence on the current date/time (inject or freeze it), no data shared across
   tests, no arbitrary `wait(ms)`/`sleep`, no dependence on run order, no flaky
   external services. Wait for a concrete state instead of a timer, e.g.
   `await expect(page.getByText('Booking confirmed')).toBeVisible()` or polling a
   specific DB/API condition.
5. **Each test is fully independent.** It creates its own prerequisite data, runs the
   scenario, asserts the result, and cleans up in `finally`/teardown. Never assume an
   earlier test already created a user, mentor, or booking (this restates the base
   skill's no-seeded-data rule; do not weaken it).
6. **Prepare data through the API or a direct test-layer call, not by re-driving the
   UI.** If the scenario under test is the payment screen, create the order via
   `testApi`/service call and drive only the flow being tested through the UI. Drive
   the full UI path only when that end-to-end path is itself the scenario's purpose.
7. **Assert at the levels that matter for this scenario, not every level available.**
   An integration test may observe API response, UI state, DB row, emitted event, or
   an external-integration call — assert only the ones this scenario's business case
   is about.
8. **Replace external integrations with controlled doubles.** Payment providers,
   mail senders, or other third-party APIs must not be able to flake the suite.
   Use a test/sandbox mode, a mock server, a fake adapter, or captured
   request/response fixtures — but still assert the system sent the *correct*
   outbound request (endpoint, payload shape, key fields). Never mock this repo's
   own collaborating components when the scenario's job is to verify their
   collaboration.
9. **Cover positive, negative, and edge cases per feature**, not just the happy path:
   invalid input, missing authorization, missing resource, conflict/duplicate
   operation, integration timeout, external-system error, boundary values. Each
   distinct case is its own `TC-{AREA}-{NNN}`, not a branch inside one scenario.
10. **Verify idempotency wherever a request or webhook can repeat.** Replaying the
    same webhook/message/request must not double-apply the effect (e.g., a repeated
    payment webhook must not book the session twice or charge twice).
11. **Use stable, semantic UI selectors, in this preference order:** role + accessible
    name, label, visible text, `data-testid` only when nothing semantic is stable.
    Never select by DOM structure or CSS position (`div.container > div:nth-child(3)`).
    This matches the base skill's "observed real snapshots, never guessed CSS" rule.
12. **Make assertions specific, not just truthy.** Prefer
    `expect(response.status()).toBe(201); expect(body).toMatchObject({ status: 'paid', ... })`
    over `expect(response.ok()).toBeTruthy()`. A failure must immediately show what
    was wrong.
13. **Don't bury the behavior under an over-general helper.** A helper like
    `completeCheckout(page, order)` can hide half of what the test is meant to prove.
    Prefer small, single-purpose steps: `openCheckout(...)`,
    `enterPaymentDetails(...)`, `confirmPayment(...)`.
14. **Name tests as condition + result.** E.g. "rejects the payment when the webhook
    signature is invalid", never "payment test 3". Apply this to both the `it(...)`
    description and the scenario's title.
15. **AI may draft; a human reviews before it ships.** A scenario produced by this
    skill is a draft: it must trace to an actual business requirement or spec, be
    unambiguous, deterministic, and readable by the team, and the expected result
    must come from the requirement/spec/observed real behavior — never from a model's
    guess. Flag anywhere the expected result was inferred rather than observed or
    spec-derived, so a human can confirm it before merge.

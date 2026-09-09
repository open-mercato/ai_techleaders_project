# DevMentor — 1.1: Stripe Connect onboarding status

Date: 2026-09-08
Status: blocked — **the Stripe topology and connected-account configuration must be approved first**
Issue: [#19](https://github.com/open-mercato/ai_techleaders_project/issues/19) (epic #8), task
[#33](https://github.com/open-mercato/ai_techleaders_project/issues/33)
Depends on: E02-S01 (#15); the webhook inbox from E03-S03-T01 (#34) for event delivery
Design authority: this standalone 1.1 story. The B14′ entry in
`.ai/specs/2026-09-08-platform-primitives-ii.md` is a non-normative catalogue pointer.

This standalone story owns its behavior and the minimum architecture needed to implement it; no E02
epic section supplies a hidden fifth slice.

## 📝 TLDR

A mentor starts Stripe's hosted Connect onboarding from DevMentor and sees a durable, normalized
onboarding status. The status is visible to the mentor and operator and to nobody else. This story
does not implement Checkout, transfers, fees or the downstream payout guard.

## 📝 Problem Statement

R05 makes Stripe Connect the only payout channel and requires onboarding before the first payout. D13
leaves it out of the first iteration. That conflicts with a payable first iteration: Q19 is therefore
a **production-launch blocker**, not an implied manual-payout design. This 1.1 story closes Connect
onboarding only. Settlement and its payout-readiness guard remain owned by #25.

## 📝 Scope

**In, after the blocking decision:** a narrow `ConnectGateway`; durable account-provisioning state; account creation exactly once
per mentor using a stable idempotency key and mentor metadata; a freshly minted account link on every
attempt; cached status reads; explicit provider refresh; webhook-triggered reconciliation; the
operator's read-only view.

**Out:** Stripe Checkout (#34); platform fees, transfers, payouts and the payout-readiness guard (#25);
manual payouts or any other interim workaround (Q19 requires an explicit superseding decision).

## 📝 UI/UX

**`/mentor/payouts`** — app surface. "Set up payouts" until an account exists, then one normalized
state: `action_required`, `pending_verification`, `enabled` or `restricted`. Action-required items are
mapped to stable, user-facing guidance; raw provider field names are never exposed as product copy.
The ordinary page read uses cached state. An explicit "Refresh status" action asks Stripe and persists
the reconciled result.

**The account link is never stored.** Every start mints a fresh, single-use link. Stripe's
`return_url` is a GET and performs no write or provider call; it displays cached state and offers the
explicit status-refresh action. Stripe's separate `refresh_url` lands on an authenticated page that
explains the expired/used link and offers a button backed by the normal CSRF-protected start POST.
Webhooks provide the normal status-reconciliation path.

**`/admin/users`** — the operator gains a Payouts column behind the operator guard. No other role sees
the field, and the public mentor DTO never carries it.

## ✅ Acceptance criteria

- Given an approved Connect configuration and a mentor, When they start Connect onboarding, Then a Connect account is provisioned durably,
  they are sent to Stripe's hosted onboarding and the return page shows cached status. (R05)
- Given Stripe reporting onboarding complete, When the mentor or the operator opens the mentor's
  settings, Then "payouts enabled" is shown to them and to no one else. (R05, data scoping)
- Given concurrent starts or a crash after Stripe creates the account but before the local response,
  When onboarding is retried, Then the same stable idempotency key and mentor metadata reconcile to
  one provider account, while each successful attempt issues a fresh account link.
- Given the same or an out-of-order `account.updated` event, When it is processed, Then the handler
  fetches current provider state and idempotently persists the normalized result rather than applying
  stale event payload state.
- Given the mentor opens the payouts page, When cached state exists, Then GET performs no provider
  call; When the mentor explicitly refreshes, Then POST fetches and persists current state.
- Given Stripe redirects the mentor back, When the return GET runs, Then it performs no mutation and
  makes no provider call.
- Given Stripe credentials that are not configured, When a mentor submits start or refresh, Then the
  POST fails closed with a `503`; cached GETs, the build and every public page still work. (R05,
  fail-closed)
- Given the topology/configuration decision is still unresolved, When start is submitted in any
  environment, Then it returns `503 connect_not_configured`, writes no provisioning row and makes no
  provider call.
- Given an expired or already-used account link, When Stripe sends the mentor to `refresh_url`, Then
  the authenticated page offers a fresh start; clicking it issues a new link through POST.

## 📝 Data model and recovery

`ConnectAccount` lives under the `payments` concept rather than widening `MentorProfile` with provider
state. It has one unique `mentorProfileId`, a nullable unique `providerAccountId`, a stable unique
`provisioningKey`, `provisioningState`, normalized `onboardingStatus`, stable `actionKeys`,
`lastReconciledAt` and a safe diagnostic code. It stores no Account Link URL, raw KYC payload or raw
requirements object.

`provisioningState` is `pending | provisioned | reconciliation_required | failed`.
`onboardingStatus` is `action_required | pending_verification | enabled | restricted`.
`ProviderConnectSnapshot` contains only the provider account id, mentor/provisioning metadata,
`payoutsEnabled`, `detailsSubmitted`, `currentlyDue`, `pendingVerification`, `pastDue` and
`disabledReason`; it excludes person and bank-account data.

The core port is limited to the three provider operations this story calls:

```ts
interface ConnectGateway {
  ensureAccount(input: {
    provisioningKey: string;
    mentorProfileId: string;
    configuration: ApprovedConnectConfiguration;
  }): Promise<ProviderConnectSnapshot>;
  createOnboardingLink(input: {
    providerAccountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string; expiresAt: Date }>;
  retrieveAccount(providerAccountId: string): Promise<ProviderConnectSnapshot>;
}
```

`ApprovedConnectConfiguration` is server-owned and cannot be constructed until the topology question
is decided. `ensureAccount` encapsulates provider idempotency and metadata recovery. There are no
Checkout, refund, transfer or payout methods on this interface.

The service creates and commits the local provisioning row before calling Stripe. It then creates the
provider account with the row's stable idempotency key and `mentor_profile_id` metadata and persists
the returned account id. Concurrent callers use the same key. A timeout is ambiguous, so retry first
reuses the key and, if the result can no longer be replayed, paginates connected accounts to reconcile
the metadata before any new create. The idempotency key is a retry aid, not the durable source of
truth: Stripe may prune keys after at least 24 hours.

State transitions are explicit: a committed local row starts `pending`; provider success with an id
becomes `provisioned`; a timeout or otherwise ambiguous outcome becomes
`reconciliation_required`; a deterministic non-retryable rejection becomes `failed`. Retry never
changes the provisioning key or creates while reconciliation is unresolved. Zero metadata matches
remain retryable; more than one matching provider account fails closed for operator reconciliation.

Status mapping has a fixed precedence: `enabled` requires `payoutsEnabled` and no disabled reason;
`restricted` covers a disabled reason or past-due requirement; `action_required` covers any
currently-due requirement or an otherwise incomplete account; `pending_verification` covers submitted
details with only pending verification remaining. Known provider requirement paths map to stable
`actionKeys`; any unknown path maps to `connect.continue_onboarding` and is safely logged, never
silently dropped or treated as enabled.

## 📝 API contracts

All API routes use `apiHandler`, E01's request scope and visible mentor/operator guards. State-changing
POSTs rely on `apiHandler` as the sole CSRF owner; services independently authorize through their
injected request-scoped `Session`.

| Route | Method | Behavior |
|---|---|---|
| `/api/mentors/me/connect` | GET | cached normalized state only; no provider call |
| `/api/mentors/me/connect/start` | POST | provision/reconcile one account, mint a fresh link, return its URL |
| `/api/mentors/me/connect/refresh` | POST | retrieve current account state and persist the normalized result |
| `/mentor/payouts/return` | GET page | show cached state and a refresh action; no mutation |
| `/mentor/payouts/reauth` | GET page | explain expired/used link and offer the start POST; no mutation |

The start response is `Cache-Control: no-store`, and the Account Link URL is redacted from structured
logs and errors. Only the authenticated owning mentor can request or receive it.

The existing operator users projection additively gains normalized Connect status. The public mentor
projection never gains it. `account.updated` is consumed through #34's durable webhook inbox; its
handler retrieves the current Account and applies the same reconciliation function as the explicit
refresh, so duplicate and out-of-order event payloads cannot regress state.

The webhook path also covers the earliest-event race. If the provider account id is not yet stored,
the handler uses the retrieved Account's trusted `mentor_profile_id` and provisioning-key metadata to
lock and attach the one local provisioning row. Missing, mismatched or multiply matched metadata fails
closed and leaves the inbox event retryable/operator-visible; it never creates a second row or guesses.

Provider constraints were checked against Stripe's official
[Account Links](https://docs.stripe.com/api/account_links),
[hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding),
[idempotent requests](https://docs.stripe.com/api/idempotent_requests) and
[charge-type guidance](https://docs.stripe.com/connect/charges).

## 📝 Risks

`risk-high` (money, data scoping), `needs-qa`, second reviewer. Compatibility: additive columns (§3);
prerequisite #34 solely owns the shared optional `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
configuration; this story consumes them and adds no duplicate environment key. Both have fail-closed
consumers (§4). The narrow `ConnectGateway` is an additive package export (§2). Production account
creation must remain
disabled until the Stripe charge/transfer topology and account configuration are approved, because
those choices affect the account capabilities and controller properties created here.

Every new or changed production file — entity, migration, gateway, adapter, service, routes, pages and
operator projection — is explicitly added to `coverage.include` and reaches 100% statements, branches,
functions and lines. Provider behavior is unit-tested behind the fake gateway; an integration scenario
uses Stripe test mode only when credentials are explicitly supplied and never makes the ordinary test
suite depend on an external account.

## 📝 Decisions in play

D04/R05, D13 (this is 1.1), D19/R18.

## 📝 Open questions

- **Q19 — how a payable first iteration exists before Connect ships** (owner: founder A with founder
  B). Blocking production launch until D13 or the payable-first-iteration requirement is explicitly
  superseded. This spec does not invent a manual payout path.
- **Stripe topology and account configuration** (owner: founders with the #25 author). Separate
  transfers versus destination charges, controller properties, capabilities and responsibility for
  negative balances must be selected before production account provisioning. Blocking for production
  implementation of this story. No implementation PR starts before this gate is resolved.

## 📋 Implementation plan after the gate

1. Record the approved charge topology, Accounts API version, controller/responsibility properties,
   capabilities and operational owner in this spec; change status back to active.
2. Add `ConnectAccount` and its reversible migration, including uniqueness and state checks.
3. Add the three-method `ConnectGateway`, fake and Stripe adapters, prerequisite-config consumption
   and redaction. Unit-test retries, idempotency retention loss, metadata pagination and provider errors.
4. Add the scoped service, state/status mapping and reconciliation, including earliest-webhook and
   zero/multiple-match branches.
5. Add cached GET, CSRF-protected start/refresh, return/reauth pages and the operator projection.
6. Add page and route unit tests at 100% per file, webhook-inbox integration coverage, browser coverage
   for start/return/reauth, and an opt-in Stripe test-mode scenario.

**Rollback:** disable start/refresh first, then roll back additive application/schema changes in
reverse order. Never delete or reject a provider account automatically during code rollback; retain
its id and metadata in the operator handoff so re-enabling or manual reconciliation cannot create a
duplicate.

# DevMentor — E02-S05: Stripe Connect onboarding and payout status

Date: 2026-09-08
Status: active — **1.1, not the first iteration (D13)**
Issue: [#19](https://github.com/open-mercato/ai_techleaders_project/issues/19) (epic #8), task
[#33](https://github.com/open-mercato/ai_techleaders_project/issues/33)
Depends on: E02-S01 (#15); the webhook inbox from E03-S03-T01 (#34) for the fast path
Design authority for architecture, the port and the data model:
`.ai/specs/2026-09-08-mentors-become-bookable.md` (Slice 5) and
`.ai/specs/2026-09-08-platform-primitives-ii.md` (B14′)

A **thin story spec** — behaviour, screens and acceptance criteria only.

## 📝 TLDR

A mentor starts Stripe's hosted Connect onboarding from DevMentor, comes back to a status page, and
sees either "payouts enabled" or exactly what Stripe still requires. The status is visible to the
mentor and the operator and to nobody else, and no payout is made while onboarding is incomplete.

## 📝 Problem Statement

R05 makes Stripe Connect the only payout channel and requires onboarding before the first payout. D13
leaves it out of the first iteration, which is precisely why Q19 — how first-iteration mentors are paid
at all — is open and blocking before the first payout falls due. This story closes the mechanism; Q19
remains a founders' decision about the interim.

## 📝 Scope

**In:** the three Connect operations on the payment port and both adapters' implementations of them;
account creation exactly once per mentor; a freshly minted account link on every attempt; status read
on return and on webhook; the payout guard; the operator's view.

**Out:** the fee split and the transfer itself (#25); Stripe Checkout (#34 — this story declares its
port methods but implements none of them); paying first-iteration mentors by hand (Q19).

## 📝 UI/UX

**`/mentor/payouts`** — app surface. "Set up payouts" until an account exists, then either "Payouts
enabled" or a `ReadinessChecklist` built from `requirements.currently_due` — Stripe's own list, shown
verbatim rather than flattened into "incomplete", because a mentor can only act on the specific item.

**The account link is never stored.** Stripe account links expire in minutes; every click mints a fresh
one. Returning from Stripe re-reads status rather than trusting the redirect, so the page is correct
even when the webhook has not arrived.

**`/admin/users`** — the operator gains a Payouts column behind the operator guard. No other role sees
the field, and the public mentor DTO never carries it.

## ✅ Acceptance criteria

- Given a mentor, When they start Connect onboarding, Then they are sent to Stripe's hosted onboarding
  and return to DevMentor with a status. (R05)
- Given a mentor whose onboarding is incomplete, When a payout would fall due, Then no payout is made
  and the mentor sees what is missing. (R05, negative)
- Given Stripe reporting onboarding complete, When the mentor or the operator opens the mentor's
  settings, Then "payouts enabled" is shown to them and to no one else. (R05, data scoping)
- Given a mentor who starts onboarding twice, When the second attempt is made, Then no second Connect
  account is created and a fresh account link is issued.
- Given the same `account.updated` event delivered twice, When both are processed, Then the status is
  applied once. (idempotence)
- Given Stripe credentials that are not configured, When a mentor opens the payouts page, Then the
  route fails closed with a `503` and the app still builds, boots and serves every public page. (R05,
  fail-closed)
- Given an expired account link, When the mentor returns and clicks again, Then a new link is issued.

## 📝 Risks

`risk-high` (money, data scoping), `needs-qa`, second reviewer. Compatibility: additive columns (§3);
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are `optional()` with fail-closed routes (§4); the port
interface is a package export extended additively (§2).

**This story declares the whole `PaymentGateway` port, which pre-empts part of #34.** The ownership
boundary is written once, in B14′; the short version is that E02 owns the three Connect signatures and
their implementations, #34 owns the rest, and E02's adapters implement `ConnectGateway` only — no story
writes a stub body for a method it does not implement.

## 📝 Decisions in play

D04/R05, D13 (this is 1.1), D19/R18.

## 📝 Open questions

- **Q19 — how first-iteration mentors are paid before this ships** (owner: founder A with founder B).
  Blocking before the first payout falls due; non-blocking for implementing this story.
- **Stripe topology — separate transfers vs destination charges.** #25 says that story's spec must
  choose. The port surface supports either, and nothing in this story depends on the answer.

/**
 * Where a mentor's share of a completed session got to.
 *
 * `held` is not a failure: it is the state of money DevMentor owes a mentor who has not
 * finished Connect onboarding yet (R05). `heldReason` says which hold it is, so the answer
 * to "why has nobody been paid" is a column rather than an investigation.
 */
export const PAYOUT_STATUSES = ['held', 'transferred', 'failed'] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Why a payout is `held`. One value today; the union is the point. */
export const PAYOUT_HELD_REASONS = ['connect_onboarding_incomplete'] as const;

export type PayoutHeldReason = (typeof PAYOUT_HELD_REASONS)[number];

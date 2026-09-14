/**
 * The states a booking can hold. `db` is the leaf package, so this is the single source of
 * truth for the union: the entity's `status` column is built from it (which is what makes
 * MikroORM generate the membership `CHECK`), and `core` re-exports it so nothing else
 * redeclares the list. Same arrangement as `ROLES`.
 *
 * Four states, and exactly one legal transition out of each:
 *
 * - `pending` — the slot is held while the mentee pays. Expires on its own.
 * - `confirmed` — payment verified. **Only the payment webhook writes this**; returning
 *   from Checkout in a browser proves nothing.
 * - `cancelled` — the mentee cancelled a confirmed booking. Terminal.
 * - `expired` — the hold lapsed, or a later reservation superseded it. Terminal.
 *
 * `ACTIVE_BOOKING_STATUSES` is the pair that holds a slot, and it is load-bearing: the
 * partial unique index on `slot` covers exactly these two, which is what lets a lapsed hold
 * release its slot without deleting the row.
 */
export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'expired'] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed'] as const;

export type ActiveBookingStatus = (typeof ACTIVE_BOOKING_STATUSES)[number];

/**
 * Why a payment could not be accepted, when the booking is otherwise intact.
 *
 * `amount_mismatch` is the one case E03-S03 names: the provider reported an amount that is
 * not the mentor's price for the chosen length (R08). The booking is left unconfirmed and
 * flagged rather than quietly confirmed at the wrong price, because the money has to be
 * reconciled by a person either way and a silent acceptance hides that it must be.
 */
export const PAYMENT_ISSUES = ['amount_mismatch'] as const;

export type PaymentIssue = (typeof PAYMENT_ISSUES)[number];

/**
 * Where a cancelled booking's money got to.
 *
 * `none` is the normal state and also the **deliberate** one for a cancellation inside the
 * 24-hour window: D10 forfeits the fee, so "no refund" is an outcome the product chose, not
 * a refund that failed. `failed` is the one that needs a person — it means the refund was
 * owed, attempted, and did not settle.
 */
export const REFUND_STATUSES = ['none', 'pending', 'refunded', 'failed'] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

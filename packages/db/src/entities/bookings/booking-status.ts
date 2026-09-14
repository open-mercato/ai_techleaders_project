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

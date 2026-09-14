/**
 * What a notification is about. `db` owns the union, so the column's membership `CHECK` is
 * generated from this list and nothing else redeclares it — the same arrangement as `ROLES`
 * and `BOOKING_STATUSES`.
 *
 * Append-only in practice: `SDLC.md` grades tightening a constraint existing rows may
 * violate as breaking, so removing a value later is an expand-then-contract migration.
 */
export const NOTIFICATION_KINDS = [
  'booking_confirmed',
  'booking_cancelled',
  /**
   * A completed session's payout is owed but cannot be sent, because the mentor has not
   * finished Connect onboarding (R05). The held row is the record; this is how the mentor
   * finds out there is money waiting for them to claim.
   */
  'payout_held',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

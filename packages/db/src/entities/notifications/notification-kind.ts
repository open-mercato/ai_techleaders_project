/**
 * What a notification is about. `db` owns the union, so the column's membership `CHECK` is
 * generated from this list and nothing else redeclares it — the same arrangement as `ROLES`
 * and `BOOKING_STATUSES`.
 *
 * Append-only in practice: `SDLC.md` grades tightening a constraint existing rows may
 * violate as breaking, so removing a value later is an expand-then-contract migration.
 */
export const NOTIFICATION_KINDS = ['booking_confirmed', 'booking_cancelled'] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { Slot } from '../availability/slot.entity';
import { User } from '../auth/user.entity';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUSES,
  PAYMENT_ISSUES,
  REFUND_STATUSES,
} from './booking-status';

const p = defineEntity.properties;

/**
 * One mentee's reservation of one mentor slot.
 *
 * **The slot is arbitrated by the database, not by a read-then-write.** The partial unique
 * index `bookings_active_slot_unique` covers `slot` only where the status is `pending` or
 * `confirmed`, so two concurrent reservations on one slot produce one row and one `23505`
 * — decided by PostgreSQL, not by a check the loser also passed a millisecond earlier.
 * `expired` and `cancelled` rows drop out of the index, which is what lets a lapsed hold
 * release its slot while the history stays.
 *
 * **`startsAt` is copied from the slot rather than read through it**, and `bookedAt` is
 * stamped at confirmation. Together they make booking-to-start (R15, D22's median)
 * readable from this row alone — no join to a mutable slot, and no dependence on a slot
 * that a mentor may later remove.
 *
 * **`priceCents` is a snapshot and the client never supplies it.** It is read from the
 * mentor's stored price for the chosen length at reservation, and the payment webhook
 * refuses a Checkout whose amount differs from it (R08).
 *
 * **The three relations `restrict` rather than cascade.** A booking is a money record: it
 * must not disappear because a slot, a mentor profile or a user row was deleted. The
 * consequence is deliberate and worth stating — with a confirmed booking present, deleting
 * the mentee's user row is refused, because `mentor_profiles` and `slots` already cascade
 * from `users` and the restriction stops the chain here. Erasing a person who has paid for
 * a session is a data-retention decision with its own rules, not a row delete.
 */
export const Booking = defineSingletonEntity('Booking', () =>
  defineEntity({
    name: 'Booking',
    tableName: 'bookings',
    properties: {
      ...baseProperties,
      // Per-property thunks so the cross-entity references resolve lazily at discovery
      // time, avoiding the circular-import pitfall between these files.
      slot: () => p.manyToOne(Slot).deleteRule('restrict'),
      mentee: () => p.manyToOne(User).deleteRule('restrict'),
      mentorProfile: () => p.manyToOne(MentorProfile).deleteRule('restrict'),
      lengthMinutes: p.integer(),
      priceCents: p.integer(),
      currency: p.string().length(3),
      status: p.enum(BOOKING_STATUSES).default('pending'),
      startsAt: p.datetime(),
      /** Stamped at confirmation (R15). Null while pending, and on an expired hold. */
      bookedAt: p.datetime().nullable(),
      /** When a `pending` hold lapses. Null once the booking leaves `pending`. */
      expiresAt: p.datetime().nullable(),
      /**
       * The payment provider's Checkout session, unique so a confirmation can find exactly
       * one booking from a webhook and two bookings can never claim one payment.
       */
      stripeCheckoutSessionId: p.string().length(120).nullable().unique(),
      stripePaymentIntentId: p.string().length(120).nullable(),
      /** When the payment was verified, and the amount the provider actually reported. */
      paidAt: p.datetime().nullable(),
      amountPaidCents: p.integer().nullable(),
      /** Set instead of confirming when the payment cannot be accepted as it stands. */
      paymentIssue: p.enum(PAYMENT_ISSUES).nullable(),
      /**
       * The fee split, snapshotted at confirmation (R10).
       *
       * Nullable because a booking that was never paid for has no split, and because the
       * fee **in force at that moment** is what this session owed — a later change to
       * `PLATFORM_FEE_PERCENT` must not rewrite it.
       */
      feePercentApplied: p.integer().nullable(),
      platformFeeCents: p.integer().nullable(),
      mentorShareCents: p.integer().nullable(),
      /** When the mentee cancelled, and where the money got to (D10, R09). */
      cancelledAt: p.datetime().nullable(),
      refundStatus: p.enum(REFUND_STATUSES).default('none'),
      stripeRefundId: p.string().length(120).nullable(),
      refundedAmountCents: p.integer().nullable(),
    },
    uniques: [
      {
        name: 'bookings_active_slot_unique',
        properties: ['slot'],
        where: { status: { $in: [...ACTIVE_BOOKING_STATUSES] } },
      },
    ],
    indexes: [
      { name: 'bookings_mentee_starts_at_index', properties: ['mentee', 'startsAt'] },
      {
        name: 'bookings_mentor_profile_starts_at_index',
        properties: ['mentorProfile', 'startsAt'],
      },
      // The expiry sweep reads exactly this pair.
      { name: 'bookings_status_expires_at_index', properties: ['status', 'expiresAt'] },
    ],
    checks: [
      {
        name: 'bookings_length_minutes_offered',
        expression: '"length_minutes" in (25, 50)',
      },
      { name: 'bookings_price_cents_positive', expression: '"price_cents" > 0' },
    ],
  }),
);

export type IBooking = InferEntity<typeof Booking>;

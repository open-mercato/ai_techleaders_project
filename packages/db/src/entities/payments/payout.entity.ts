import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { Booking } from '../bookings/booking.entity';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { PAYOUT_HELD_REASONS, PAYOUT_STATUSES } from './payout-status';

const p = defineEntity.properties;

/**
 * What DevMentor owes one mentor for one completed session (E03-S06).
 *
 * **`booking` is unique, and that uniqueness is what makes the payout run safe to repeat.**
 * There is no scheduler in this project, so the run is triggered by hand and may be
 * triggered twice; a second row for the same session would be a second transfer. The
 * database refuses it.
 *
 * A `held` row is money owed and not yet sent — the normal state for a mentor who has not
 * finished Connect onboarding — so it is deliberately a row rather than an absence. "Nobody
 * has been paid" and "nothing was owed" must not look the same.
 *
 * Both relations `restrict`, like `Booking`'s and for the same reason: this is a money
 * record, and deleting the session or the mentor must not take it.
 */
export const Payout = defineSingletonEntity('Payout', () =>
  defineEntity({
    name: 'Payout',
    tableName: 'payouts',
    properties: {
      ...baseProperties,
      // Per-property thunks so the cross-entity references resolve lazily at discovery time.
      booking: () => p.oneToOne(Booking).inversedBy('payout').owner().unique().deleteRule('restrict'),
      mentorProfile: () => p.manyToOne(MentorProfile).deleteRule('restrict'),
      amountCents: p.integer(),
      status: p.enum(PAYOUT_STATUSES).default('held'),
      heldReason: p.enum(PAYOUT_HELD_REASONS).nullable(),
      stripeTransferId: p.string().length(120).nullable(),
    },
    indexes: [{ name: 'payouts_status_index', properties: ['status'] }],
    checks: [
      { name: 'payouts_amount_cents_non_negative', expression: '"amount_cents" >= 0' },
    ],
  }),
);

export type IPayout = InferEntity<typeof Payout>;

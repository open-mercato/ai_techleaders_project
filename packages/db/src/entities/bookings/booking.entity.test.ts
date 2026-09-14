import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { entities } from '../index';
import { Booking } from './booking.entity';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUSES } from './booking-status';

function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

const meta = Booking.init().meta;
const properties = meta.properties;

describe('booking statuses', () => {
  it('names four states, of which exactly two hold a slot', () => {
    expect(BOOKING_STATUSES).toEqual(['pending', 'confirmed', 'cancelled', 'expired']);
    expect(ACTIVE_BOOKING_STATUSES).toEqual(['pending', 'confirmed']);
    expect(BOOKING_STATUSES).toEqual(expect.arrayContaining([...ACTIVE_BOOKING_STATUSES]));
  });
});

describe('Booking entity', () => {
  it('maps the reservation, its price snapshot and its lifecycle timestamps', () => {
    expect(meta.className).toBe('Booking');
    expect(meta.tableName).toBe('bookings');
    expect(Object.keys(properties).sort()).toEqual([
      'bookedAt',
      'createdAt',
      'currency',
      'expiresAt',
      'id',
      'lengthMinutes',
      'mentee',
      'mentorProfile',
      'priceCents',
      'slot',
      'startsAt',
      'status',
      'updatedAt',
    ]);
  });

  it('is registered for ORM discovery', () => {
    expect(entities).toContain(Booking);
  });

  it.each(['slot', 'mentee', 'mentorProfile'] as const)(
    'holds %s by reference and refuses to be deleted with it',
    (relation) => {
      expect(properties[relation]!.kind).toBe('m:1');
      expect(properties[relation]!.nullable).toBeFalsy();
      // A booking is a money record. Deleting the slot, the mentor or the mentee must not
      // take it with them — see the note on the entity.
      expect(properties[relation]!.deleteRule).toBe('restrict');
    },
  );

  it('starts pending and constrains the status to the four known states', () => {
    expect(properties.status!.default).toBe('pending');
    expect(properties.status!.items).toEqual([...BOOKING_STATUSES]);
    expect(properties.status!.nullable).toBeFalsy();
  });

  it('copies the slot start and leaves the confirmation and hold instants open', () => {
    expect(typeName(properties.startsAt!)).toBe('DateTimeType');
    expect(properties.startsAt!.nullable).toBeFalsy();
    expect(properties.bookedAt!.nullable).toBe(true);
    expect(properties.expiresAt!.nullable).toBe(true);
  });

  it('snapshots one price in minor units with its currency', () => {
    expect(properties.priceCents!.nullable).toBeFalsy();
    expect(properties.currency!.length).toBe(3);
    expect(properties.lengthMinutes!.nullable).toBeFalsy();
  });

  it('lets only one pending or confirmed booking hold a slot', () => {
    expect(meta.uniques).toEqual([
      {
        name: 'bookings_active_slot_unique',
        properties: ['slot'],
        where: { status: { $in: ['pending', 'confirmed'] } },
      },
    ]);
  });

  it('indexes each party by start time and the expiry sweep by its own pair', () => {
    expect(meta.indexes).toEqual([
      { name: 'bookings_mentee_starts_at_index', properties: ['mentee', 'startsAt'] },
      {
        name: 'bookings_mentor_profile_starts_at_index',
        properties: ['mentorProfile', 'startsAt'],
      },
      { name: 'bookings_status_expires_at_index', properties: ['status', 'expiresAt'] },
    ]);
  });

  it('refuses an unoffered length and a non-positive price in the database', () => {
    expect(meta.checks).toEqual([
      {
        name: 'bookings_length_minutes_offered',
        expression: '"length_minutes" in (25, 50)',
      },
      { name: 'bookings_price_cents_positive', expression: '"price_cents" > 0' },
    ]);
  });
});

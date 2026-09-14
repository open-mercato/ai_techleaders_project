import { NotFoundError, SESSION_NOT_FOUND_MESSAGE } from '@devmentor/core';
import { describe, expect, it } from 'vitest';
import { requireBookingId } from './booking-id';

const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

describe('requireBookingId', () => {
  it('reads the id out of the route parameters', () => {
    expect(requireBookingId({ bookingId: BOOKING_ID })).toBe(BOOKING_ID);
  });

  it('reads the first segment when the router hands back an array', () => {
    expect(requireBookingId({ bookingId: [BOOKING_ID, 'ignored'] })).toBe(BOOKING_ID);
  });

  it.each([undefined, {}, { id: BOOKING_ID }])(
    'refuses params that carry no booking id: %j',
    (params) => {
      expect(() => requireBookingId(params as Record<string, string> | undefined))
        .toThrow(NotFoundError);
      expect(() => requireBookingId(params as Record<string, string> | undefined))
        .toThrow(SESSION_NOT_FOUND_MESSAGE);
    },
  );

  it('refuses an empty array, which carries no first segment either', () => {
    expect(() => requireBookingId({ bookingId: [] })).toThrow(NotFoundError);
  });
});

import { describe, expect, it } from 'vitest';
import { bookingCreateSchema } from './booking-create.schema';

const SLOT_ID = '40000000-0000-4000-8000-000000000001';

describe('bookingCreateSchema', () => {
  it.each([25, 50])('accepts a slot and a %i-minute length', (lengthMinutes) => {
    expect(bookingCreateSchema.parse({ slotId: SLOT_ID, lengthMinutes })).toEqual({
      slotId: SLOT_ID,
      lengthMinutes,
    });
  });

  it.each([
    {},
    { slotId: SLOT_ID },
    { slotId: 'not-a-uuid', lengthMinutes: 25 },
    { slotId: SLOT_ID, lengthMinutes: 30 },
    { slotId: SLOT_ID, lengthMinutes: 25.5 },
    { slotId: SLOT_ID, lengthMinutes: '25' },
  ])('rejects %j', (input) => {
    expect(bookingCreateSchema.safeParse(input).success).toBe(false);
  });

  it('names the lengths the product offers when refusing another one', () => {
    const refusal = bookingCreateSchema.safeParse({ slotId: SLOT_ID, lengthMinutes: 90 });

    expect(refusal.success).toBe(false);
    expect(refusal.error?.issues[0]?.message).toBe(
      'Choose a session length of 25 or 50 minutes.',
    );
  });

  it('refuses a client-supplied price rather than carrying it', () => {
    // R08: the amount comes from the mentor's stored price, never from the caller. An
    // unknown key is stripped, so a client that sends one cannot influence the charge.
    expect(
      bookingCreateSchema.parse({ slotId: SLOT_ID, lengthMinutes: 25, priceCents: 1 }),
    ).toEqual({ slotId: SLOT_ID, lengthMinutes: 25 });
  });
});

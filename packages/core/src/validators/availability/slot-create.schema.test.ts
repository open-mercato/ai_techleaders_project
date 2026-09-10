import { describe, expect, it } from 'vitest';
import { slotCreateSchema } from './slot-create.schema';

describe('slotCreateSchema', () => {
  it('accepts an ISO UTC instant without applying temporal policy', () => {
    expect(slotCreateSchema.parse({ startsAt: '2020-01-01T00:00:00.000Z' })).toEqual({
      startsAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it.each([
    {},
    { startsAt: '2026-09-10 14:00' },
    { startsAt: '2026-09-10T14:00:00' },
    { startsAt: 123 },
  ])('rejects a value that is not an ISO instant: %j', (input) => {
    expect(slotCreateSchema.safeParse(input).success).toBe(false);
  });

  it('strips fields outside the request contract', () => {
    expect(
      slotCreateSchema.parse({ startsAt: '2026-09-10T14:00:00.000Z', mentorProfileId: 'other' }),
    ).toEqual({ startsAt: '2026-09-10T14:00:00.000Z' });
  });
});

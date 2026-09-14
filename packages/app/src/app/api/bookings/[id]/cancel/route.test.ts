import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { ConflictError } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  cancelByMentee: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.options = options;
    return 'POST';
  },
}));

const route = await import('./route');
const cradle = {
  bookingService: { cancelByMentee: state.cancelByMentee },
} as unknown as Cradle;
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function options(): OwnedActionOptions<unknown> {
  if (state.options === undefined) throw new Error('route.ts did not configure its action');
  return state.options;
}

function request(): Request {
  return new Request('https://devmentor.test/api/bookings/x/cancel', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.cancelByMentee.mockResolvedValue({
    id: BOOKING_ID,
    status: 'cancelled',
    refundStatus: 'refunded',
    refundedAmountCents: 12_000,
  });
});

describe('POST /api/bookings/[id]/cancel', () => {
  it('is a dynamic mentee-only action', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.POST).toBe('POST');
    expect(options().role).toBe('mentee');
  });

  it('says what happened to the money, not only that it was cancelled', async () => {
    await expect(options().run(request(), cradle, { id: BOOKING_ID })).resolves.toEqual({
      id: BOOKING_ID,
      status: 'cancelled',
      refundStatus: 'refunded',
      refundedAmountCents: 12_000,
    });
    expect(state.cancelByMentee).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
  });

  it('reads the first segment when the router hands back an array', async () => {
    await options().run(request(), cradle, { id: [BOOKING_ID, 'ignored'] });

    expect(state.cancelByMentee).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
  });

  it.each([undefined, {}])('refuses absent params: %j', async (params) => {
    await expect(
      options().run(request(), cradle, params as Record<string, string> | undefined),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(state.cancelByMentee).not.toHaveBeenCalled();
  });

  it('preserves a started-session refusal for the envelope mapper', async () => {
    const conflict = new ConflictError('This session has already started.');
    state.cancelByMentee.mockRejectedValue(conflict);

    await expect(options().run(request(), cradle, { id: BOOKING_ID })).rejects.toBe(conflict);
  });
});

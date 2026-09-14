import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { ForbiddenError } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  getForParty: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.options = options;
    return 'GET';
  },
}));

const route = await import('./route');
const cradle = {
  textSessionService: { getForParty: state.getForParty },
} as unknown as Cradle;
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function options(): OwnedActionOptions<unknown> {
  if (state.options === undefined) throw new Error('route.ts did not configure its action');
  return state.options;
}

function request(): Request {
  return new Request(`https://devmentor.test/api/sessions/${BOOKING_ID}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.getForParty.mockResolvedValue({
    bookingId: BOOKING_ID,
    viewerUserId: 'mentee-id',
    counterpartName: 'Alex Laurent',
    lengthMinutes: 50,
    window: { state: 'open', startsAt: '2026-09-14T16:00:00.000Z', endsAt: '2026-09-14T16:50:00.000Z' },
    messages: [],
    maxMessageLength: 4000,
  });
});

describe('GET /api/sessions/[bookingId]', () => {
  it('is dynamic and asks for no role, because the party is not a role', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.GET).toBe('GET');
    expect(options().role).toBeUndefined();
  });

  it('hands the id to the service and returns the session it answers with', async () => {
    await expect(options().run(request(), cradle, { bookingId: BOOKING_ID })).resolves.toMatchObject({
      bookingId: BOOKING_ID,
      window: { state: 'open' },
    });
    expect(state.getForParty).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
  });

  it('refuses an address with no booking id, before reaching the service', async () => {
    await expect(options().run(request(), cradle, undefined)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(state.getForParty).not.toHaveBeenCalled();
  });

  it('passes the service refusal through for the envelope mapper', async () => {
    const forbidden = new ForbiddenError('This session belongs to the mentee and the mentor who booked it.');
    state.getForParty.mockRejectedValue(forbidden);

    await expect(options().run(request(), cradle, { bookingId: BOOKING_ID })).rejects.toBe(forbidden);
  });
});

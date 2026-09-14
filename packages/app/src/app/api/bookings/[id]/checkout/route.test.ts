import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { ConflictError } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  startCheckout: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.options = options;
    return 'POST';
  },
}));

const route = await import('./route');
const cradle = { paymentService: { startCheckout: state.startCheckout } } as unknown as Cradle;
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function options(): OwnedActionOptions<unknown> {
  if (state.options === undefined) throw new Error('route.ts did not configure its action');
  return state.options;
}

function request(): Request {
  return new Request('https://devmentor.test/api/bookings/x/checkout', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.startCheckout.mockResolvedValue({ url: 'https://checkout.test/cs_1' });
});

describe('POST /api/bookings/[id]/checkout', () => {
  it('is a dynamic mentee-only action', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.POST).toBe('POST');
    expect(options().role).toBe('mentee');
  });

  it('opens the checkout for the booking named in the path', async () => {
    await expect(options().run(request(), cradle, { id: BOOKING_ID })).resolves.toEqual({
      url: 'https://checkout.test/cs_1',
    });
    expect(state.startCheckout).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
  });

  it('reads the first segment when the router hands back an array', async () => {
    await options().run(request(), cradle, { id: [BOOKING_ID, 'ignored'] });

    expect(state.startCheckout).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
  });

  it.each([undefined, {}])('refuses absent params: %j', async (params) => {
    await expect(
      options().run(request(), cradle, params as Record<string, string> | undefined),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(state.startCheckout).not.toHaveBeenCalled();
  });

  it('preserves a lapsed-hold conflict for the envelope mapper', async () => {
    const conflict = new ConflictError('This reservation has expired.');
    state.startCheckout.mockRejectedValue(conflict);

    await expect(options().run(request(), cradle, { id: BOOKING_ID })).rejects.toBe(conflict);
  });
});

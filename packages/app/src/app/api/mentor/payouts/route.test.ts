import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  listForMentor: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.options = options;
    return 'GET';
  },
}));

const route = await import('./route');
const cradle = { payoutService: { listForMentor: state.listForMentor } } as unknown as Cradle;

function options(): OwnedActionOptions<unknown> {
  if (state.options === undefined) throw new Error('route.ts did not configure its action');
  return state.options;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.listForMentor.mockResolvedValue([{ id: 'payout-1' }]);
});

describe('GET /api/mentor/payouts', () => {
  it('is a dynamic mentor-only read', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.GET).toBe('GET');
    expect(options().role).toBe('mentor');
  });

  it('answers from the session, passing no mentor id', async () => {
    const request = new Request('https://devmentor.test/api/mentor/payouts');

    await expect(options().run(request, cradle, undefined)).resolves.toEqual([{ id: 'payout-1' }]);
    expect(state.listForMentor).toHaveBeenCalledExactlyOnceWith();
  });
});

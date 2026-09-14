import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  runDue: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.options = options;
    return 'POST';
  },
}));

const route = await import('./route');

function cradle(): Cradle {
  return {
    payoutService: { runDue: state.runDue },
    logger: { info: state.info },
    session: Promise.resolve({ userId: 'operator-1', roles: ['operator'] }),
  } as unknown as Cradle;
}

function options(): OwnedActionOptions<unknown> {
  if (state.options === undefined) throw new Error('route.ts did not configure its action');
  return state.options;
}

const request = () =>
  new Request('https://devmentor.test/api/operator/payouts/run', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  state.runDue.mockResolvedValue({ transferred: 2, held: 1, failed: 0 });
});

describe('POST /api/operator/payouts/run', () => {
  it('is a dynamic operator-only action', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.POST).toBe('POST');
    expect(options().role).toBe('operator');
  });

  it('reports what the run did', async () => {
    await expect(options().run(request(), cradle(), undefined)).resolves.toEqual({
      transferred: 2,
      held: 1,
      failed: 0,
    });
    expect(state.runDue).toHaveBeenCalledExactlyOnceWith();
  });

  it('records who ran it, because a by-hand money action is attributable (R18)', async () => {
    await options().run(request(), cradle(), undefined);

    expect(state.info).toHaveBeenCalledWith(
      { operatorId: 'operator-1', transferred: 2, held: 1, failed: 0 },
      'operator ran due payouts',
    );
  });

  it('records the run even when the session somehow resolved to nothing', async () => {
    const anonymous = { ...cradle(), session: Promise.resolve(null) } as unknown as Cradle;

    await options().run(request(), anonymous, undefined);

    expect(state.info).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: undefined }),
      'operator ran due payouts',
    );
  });
});

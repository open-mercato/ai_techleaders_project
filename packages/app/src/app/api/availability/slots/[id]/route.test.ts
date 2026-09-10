import type { ApiRouteContext, Cradle, OwnedActionOptions } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<{ id: string }> | undefined,
  remove: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<{ id: string }>) => {
    state.options = options;
    return async (req: Request, ctx: ApiRouteContext) =>
      options.run(
        req,
        { slotService: { remove: state.remove } } as unknown as Cradle,
        ctx?.params ? await ctx.params : undefined,
      );
  },
}));

const route = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /api/availability/slots/[id]', () => {
  it('is a dynamic mentor-owned action and removes the parameterized slot', async () => {
    state.remove.mockResolvedValue({ id: 'slot-1' });

    const result = await route.DELETE(
      new Request('https://devmentor.test/api/availability/slots/slot-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'slot-1' }) },
    );

    expect(route.dynamic).toBe('force-dynamic');
    expect(state.options?.role).toBe('mentor');
    expect(state.remove).toHaveBeenCalledWith('slot-1');
    expect(result).toEqual({ id: 'slot-1' });
  });

  it.each([undefined, ['slot-1', 'slot-2']])('refuses a malformed slot parameter %#', async (id) => {
    await expect(
      route.DELETE(
        new Request('https://devmentor.test/api/availability/slots/bad', { method: 'DELETE' }),
        {
          params: Promise.resolve(
            id === undefined ? ({} as Record<string, string | string[]>) : { id },
          ),
        },
      ),
    ).rejects.toMatchObject({ status: 404, code: 'not_found', message: 'Slot not found.' });
    expect(state.remove).not.toHaveBeenCalled();
  });
});

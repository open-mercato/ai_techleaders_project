import type {
  Cradle,
  OwnedCollectionRouteOptions,
  SlotCreateInput,
  SlotOwnerDto,
} from '@devmentor/core';
import { ConflictError, slotCreateSchema } from '@devmentor/core';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedCollectionRouteOptions<SlotOwnerDto, SlotCreateInput> | undefined,
  listOwner: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedCollectionRoute: (
    options: OwnedCollectionRouteOptions<SlotOwnerDto, SlotCreateInput>,
  ) => {
    state.options = options;
    return { GET: 'GET', POST: 'POST' };
  },
}));

const route = await import('./route');
const cradle = {
  slotService: { listOwner: state.listOwner, publish: state.publish },
} as unknown as Cradle;

function options(): OwnedCollectionRouteOptions<SlotOwnerDto, SlotCreateInput> {
  if (state.options === undefined) throw new Error('route.ts did not configure its owned route');
  return state.options;
}

describe('GET/POST /api/availability/slots', () => {
  it('configures a dynamic mentor-owned collection with the shared request schema', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.GET).toBe('GET');
    expect(route.POST).toBe('POST');
    expect(options().role).toBe('mentor');
    expect(options().createSchema).toBe(slotCreateSchema);
    expect(options().createSchema?.safeParse({ startsAt: 'not-an-instant' }).success).toBe(false);
  });

  it('lists and publishes through the request-scoped slot service', async () => {
    const input = { startsAt: '2026-09-11T14:00:00.000Z' };
    const existing = [{ id: 'slot-1', startsAt: input.startsAt }];
    state.listOwner.mockResolvedValue(existing);
    state.publish.mockResolvedValue({ id: 'slot-2', startsAt: input.startsAt });

    await expect(
      options().list?.(new Request('https://devmentor.test/api/availability/slots'), cradle, undefined),
    ).resolves.toEqual(existing);
    await expect(
      options().create?.(
        new Request('https://devmentor.test/api/availability/slots', { method: 'POST' }),
        cradle,
        undefined,
        input,
      ),
    ).resolves.toEqual({ id: 'slot-2', startsAt: input.startsAt });
    expect(state.publish).toHaveBeenCalledWith(input);
  });

  it('preserves the service conflict for the owned-route envelope mapper', async () => {
    const conflict = new ConflictError('This start time is already published.');
    state.publish.mockRejectedValue(conflict);

    await expect(
      options().create?.(
        new Request('https://devmentor.test/api/availability/slots', { method: 'POST' }),
        cradle,
        undefined,
        { startsAt: '2026-09-11T14:00:00.000Z' },
      ),
    ).rejects.toBe(conflict);
  });
});

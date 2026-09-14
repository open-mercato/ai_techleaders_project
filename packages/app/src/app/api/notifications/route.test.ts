import type {
  Cradle,
  NotificationDto,
  NotificationReadInput,
  OwnedCollectionRouteOptions,
} from '@devmentor/core';
import { ForbiddenError, notificationReadSchema } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as
    | OwnedCollectionRouteOptions<NotificationDto, NotificationReadInput>
    | undefined,
  listMine: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedCollectionRoute: (
    options: OwnedCollectionRouteOptions<NotificationDto, NotificationReadInput>,
  ) => {
    state.options = options;
    return { GET: 'GET', POST: 'POST' };
  },
}));

const route = await import('./route');
const cradle = {
  notificationService: { listMine: state.listMine, markRead: state.markRead },
} as unknown as Cradle;
const ID = '60000000-0000-4000-8000-000000000001';

function options(): OwnedCollectionRouteOptions<NotificationDto, NotificationReadInput> {
  if (state.options === undefined) throw new Error('route.ts did not configure its owned route');
  return state.options;
}

function request(): Request {
  return new Request('https://devmentor.test/api/notifications', { method: 'POST' });
}

beforeEach(() => vi.clearAllMocks());

describe('/api/notifications', () => {
  it('is dynamic and names no role, because everyone signed in has notifications', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.GET).toBe('GET');
    expect(route.POST).toBe('POST');
    expect(options().role).toBeUndefined();
    expect(options().createSchema).toBe(notificationReadSchema);
  });

  it('lists the caller own notifications, passing no identity', async () => {
    state.listMine.mockResolvedValue([{ id: ID }]);

    await expect(options().list?.(request(), cradle, undefined)).resolves.toEqual([{ id: ID }]);
    expect(state.listMine).toHaveBeenCalledExactlyOnceWith();
  });

  it('marks one read by id', async () => {
    state.markRead.mockResolvedValue({ id: ID, readAt: '2026-09-14T12:00:00.000Z' });

    await expect(options().create?.(request(), cradle, undefined, { id: ID })).resolves
      .toMatchObject({ readAt: '2026-09-14T12:00:00.000Z' });
    expect(state.markRead).toHaveBeenCalledExactlyOnceWith(ID);
  });

  it('preserves the service refusal for somebody else notification', async () => {
    const refusal = new ForbiddenError();
    state.markRead.mockRejectedValue(refusal);

    await expect(options().create?.(request(), cradle, undefined, { id: ID })).rejects
      .toBe(refusal);
  });
});

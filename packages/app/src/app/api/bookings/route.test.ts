import type {
  BookingCreateInput,
  BookingDto,
  Cradle,
  OwnedActionOptions,
  OwnedCollectionRouteOptions,
} from '@devmentor/core';
import { ConflictError, bookingCreateSchema } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedCollectionRouteOptions<BookingDto, BookingCreateInput> | undefined,
  action: undefined as OwnedActionOptions<unknown> | undefined,
  start: vi.fn(),
  listForMentee: vi.fn(),
  listForMentor: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedCollectionRoute: (
    options: OwnedCollectionRouteOptions<BookingDto, BookingCreateInput>,
  ) => {
    state.options = options;
    return { GET: 'COLLECTION_GET', POST: 'POST' };
  },
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.action = options;
    return 'GET';
  },
}));

const route = await import('./route');
function cradleFor(roles: string[] | null): Cradle {
  return {
    bookingService: {
      start: state.start,
      listForMentee: state.listForMentee,
      listForMentor: state.listForMentor,
    },
    session: Promise.resolve(roles === null ? null : { userId: 'u-1', roles }),
  } as unknown as Cradle;
}

const cradle = cradleFor(['mentee']);

beforeEach(() => vi.clearAllMocks());
const SLOT_ID = '40000000-0000-4000-8000-000000000001';

function options(): OwnedCollectionRouteOptions<BookingDto, BookingCreateInput> {
  if (state.options === undefined) throw new Error('route.ts did not configure its owned route');
  return state.options;
}

function request(): Request {
  return new Request('https://devmentor.test/api/bookings', { method: 'POST' });
}

describe('POST /api/bookings', () => {
  it('configures a dynamic mentee-owned collection with the shared request schema', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.POST).toBe('POST');
    expect(options().role).toBe('mentee');
    expect(options().createSchema).toBe(bookingCreateSchema);
  });

  it('keeps the list off the collection helper, which carries only one role', () => {
    expect(options().list).toBeUndefined();
    expect(route.GET).toBe('GET');
  });

  it('reserves through the request-scoped booking service, passing no caller identity', async () => {
    const input = { slotId: SLOT_ID, lengthMinutes: 25 };
    const reserved = { id: 'booking-1', slotId: SLOT_ID, status: 'pending' };
    state.start.mockResolvedValue(reserved);

    await expect(options().create?.(request(), cradle, undefined, input)).resolves.toEqual(
      reserved,
    );
    // The session is the owned-route wrapper's job; the service receives the body alone.
    expect(state.start).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('preserves a taken-slot conflict for the owned-route envelope mapper', async () => {
    const conflict = new ConflictError('This time has just been taken. Choose another one.');
    state.start.mockRejectedValue(conflict);

    await expect(
      options().create?.(request(), cradle, undefined, { slotId: SLOT_ID, lengthMinutes: 50 }),
    ).rejects.toBe(conflict);
  });
});

function action(): OwnedActionOptions<unknown> {
  if (state.action === undefined) throw new Error('route.ts did not configure its list action');
  return state.action;
}

function listRequest(as?: string): Request {
  const query = as === undefined ? '' : `?as=${encodeURIComponent(as)}`;
  return new Request(`https://devmentor.test/api/bookings${query}`);
}

describe('GET /api/bookings', () => {
  it('gives a mentee their own sessions', async () => {
    state.listForMentee.mockResolvedValue([{ id: 'b-1' }]);

    await expect(action().run(listRequest(), cradleFor(['mentee']), undefined)).resolves
      .toEqual([{ id: 'b-1' }]);
    expect(state.listForMentor).not.toHaveBeenCalled();
  });

  it('gives a mentor the sessions booked with them', async () => {
    state.listForMentor.mockResolvedValue([{ id: 'b-2' }]);

    await expect(action().run(listRequest(), cradleFor(['mentor']), undefined)).resolves
      .toEqual([{ id: 'b-2' }]);
    expect(state.listForMentee).not.toHaveBeenCalled();
  });

  it('defaults a dual-role caller to the mentee view, and lets them ask for the other', async () => {
    const both = cradleFor(['mentee', 'mentor']);

    await action().run(listRequest(), both, undefined);
    expect(state.listForMentee).toHaveBeenCalledOnce();

    await action().run(listRequest('mentor'), both, undefined);
    expect(state.listForMentor).toHaveBeenCalledOnce();

    await action().run(listRequest('mentee'), both, undefined);
    expect(state.listForMentee).toHaveBeenCalledTimes(2);
  });

  it('refuses a view for a role the caller does not hold', async () => {
    // `?as=` selects between the caller's own roles; it widens nothing.
    await expect(action().run(listRequest('mentor'), cradleFor(['mentee']), undefined)).rejects
      .toMatchObject({ code: 'forbidden' });
    expect(state.listForMentor).not.toHaveBeenCalled();
  });

  it('refuses a view that is not one of the two', async () => {
    await expect(action().run(listRequest('operator'), cradleFor(['mentee', 'mentor']), undefined))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a caller whose session resolved to nothing', async () => {
    // The wrapper already requires a session; this is the belt to its braces.
    await expect(action().run(listRequest(), cradleFor(null), undefined)).rejects
      .toMatchObject({ code: 'forbidden' });
  });

  it('names no role at the route, because the session decides which list', () => {
    expect(action().role).toBeUndefined();
  });
});

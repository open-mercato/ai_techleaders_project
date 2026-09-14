import type {
  BookingCreateInput,
  BookingDto,
  Cradle,
  OwnedCollectionRouteOptions,
} from '@devmentor/core';
import { ConflictError, bookingCreateSchema } from '@devmentor/core';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedCollectionRouteOptions<BookingDto, BookingCreateInput> | undefined,
  start: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedCollectionRoute: (
    options: OwnedCollectionRouteOptions<BookingDto, BookingCreateInput>,
  ) => {
    state.options = options;
    return { GET: 'GET', POST: 'POST' };
  },
}));

const route = await import('./route');
const cradle = { bookingService: { start: state.start } } as unknown as Cradle;
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

  it('does not mount the list verb until the sessions list ships', () => {
    expect(options().list).toBeUndefined();
    expect(route).not.toHaveProperty('GET');
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

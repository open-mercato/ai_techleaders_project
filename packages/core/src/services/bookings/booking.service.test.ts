import { describe, expect, it, vi } from 'vitest';
import {
  Booking,
  Slot,
  UniqueConstraintViolationException,
  type EntityManager,
  type IBooking,
  type IMentorProfile,
  type ISlot,
  type IUser,
} from '@devmentor/db';
import type { Session } from '../../http/auth';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../http/errors';
import type { PlatformSettings } from '../operator/platform-settings.service';
import {
  BOOKING_HOLD_MINUTES,
  BookingService,
  LEAD_TIME_MESSAGE,
  MENTOR_NOT_BOOKABLE_MESSAGE,
  MIN_LEAD_MINUTES,
  SLOT_TAKEN_MESSAGE,
  toBookingDto,
} from './booking.service';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const MENTEE_ID = '10000000-0000-4000-8000-000000000001';
const PROFILE_ID = '30000000-0000-4000-8000-000000000001';
const SLOT_ID = '40000000-0000-4000-8000-000000000001';
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';
/** Comfortably past the two-hour rule. */
const FAR_ENOUGH = new Date('2026-09-14T15:00:00.000Z');

const SETTINGS: PlatformSettings = {
  currency: 'PLN',
  priceBounds: {
    p25: { minCents: 9_000, maxCents: 60_000 },
    p50: { minCents: 18_000, maxCents: 120_000 },
  },
};

function profile(overrides: Partial<IMentorProfile> = {}): IMentorProfile {
  return {
    id: PROFILE_ID,
    user: { id: 'mentor-user', displayName: 'Mock Mentor' } as IUser,
    slug: 'mock-mentor',
    publishedAt: NOW,
    price25Cents: 12_000,
    price50Cents: 22_000,
    ...overrides,
  } as IMentorProfile;
}

function slot(overrides: Partial<ISlot> = {}): ISlot {
  return {
    id: SLOT_ID,
    mentorProfile: profile(),
    startsAt: FAR_ENOUGH,
    removedAt: null,
    ...overrides,
  } as ISlot;
}

function heldBooking(overrides: Partial<IBooking> = {}): IBooking {
  return {
    id: BOOKING_ID,
    status: 'pending',
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...overrides,
  } as IBooking;
}

function uniqueViolation(constraint?: string): UniqueConstraintViolationException {
  const error = Object.create(UniqueConstraintViolationException.prototype) as
    UniqueConstraintViolationException & { constraint?: string };
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

function makeHarness({
  session = { userId: MENTEE_ID, roles: ['mentee'] },
  storedSlot = slot(),
  held = null,
  withoutSettings = false,
  onFlush,
}: {
  session?: Session | null | Promise<Session | null>;
  storedSlot?: ISlot | null;
  held?: IBooking | null;
  /** Explicit flag, not an `undefined` override: a default parameter would replace it. */
  withoutSettings?: boolean;
  onFlush?: () => void;
} = {}) {
  let created: Record<string, unknown> | null = null;
  const tx = {
    findOne: vi.fn(async (entity: unknown) => (entity === Slot ? storedSlot : held)),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
      created = {
        id: BOOKING_ID,
        ...data,
        slot: data.slot,
        mentorProfile: data.mentorProfile,
      };
      return created;
    }),
    persist: vi.fn(),
    flush: vi.fn(async () => onFlush?.()),
  };
  const em = {
    transactional: vi.fn(async (run: (inner: typeof tx) => unknown) => run(tx)),
  };
  const service = new BookingService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    session: session instanceof Promise ? session : Promise.resolve(session),
    platformSettingsService: withoutSettings
      ? undefined
      : { get: (): PlatformSettings => SETTINGS },
  });
  return {
    service,
    em,
    tx,
    get created() {
      return created;
    },
  };
}

describe('booking projection', () => {
  it('carries the mentor, the snapshot price and the hold, and nothing private', () => {
    const dto = toBookingDto({
      id: BOOKING_ID,
      slot: slot(),
      mentorProfile: profile(),
      lengthMinutes: 25,
      priceCents: 12_000,
      currency: 'PLN',
      status: 'pending',
      startsAt: FAR_ENOUGH,
      expiresAt: new Date('2026-09-14T12:30:00.000Z'),
    } as IBooking);

    expect(dto).toEqual({
      id: BOOKING_ID,
      slotId: SLOT_ID,
      mentorSlug: 'mock-mentor',
      mentorName: 'Mock Mentor',
      lengthMinutes: 25,
      priceCents: 12_000,
      currency: 'PLN',
      status: 'pending',
      startsAt: FAR_ENOUGH.toISOString(),
      expiresAt: '2026-09-14T12:30:00.000Z',
    });
  });

  it('reports an absent hold as null rather than omitting the key', () => {
    const dto = toBookingDto({
      id: BOOKING_ID,
      slot: slot(),
      mentorProfile: profile(),
      lengthMinutes: 50,
      priceCents: 22_000,
      currency: 'PLN',
      status: 'confirmed',
      startsAt: FAR_ENOUGH,
      expiresAt: null,
    } as IBooking);

    expect(dto.expiresAt).toBeNull();
  });
});

describe('BookingService.start authorization', () => {
  it('refuses a caller with no session', async () => {
    const h = makeHarness({ session: null });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(h.em.transactional).not.toHaveBeenCalled();
  });

  it('refuses a signed-in caller who is not a mentee', async () => {
    const h = makeHarness({ session: { userId: MENTEE_ID, roles: ['mentor'] } });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('surfaces a session that could not be resolved without leaving it unhandled', async () => {
    const failure = new Error('session store unreachable');
    const h = makeHarness({ session: Promise.reject(failure) });

    // The constructor attaches its own catch, so an unawaited rejection cannot crash the
    // process; `start` still reports the failure to its caller.
    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toBe(failure);
  });

  it('refuses to price a reservation when platform settings are unavailable', async () => {
    const h = makeHarness({ withoutSettings: true });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      ServiceUnavailableError,
    );
  });
});

describe('BookingService.start reservation rules', () => {
  it('holds the slot at the mentor stored price for the chosen length', async () => {
    const h = makeHarness();

    const dto = await h.service.start({ slotId: SLOT_ID, lengthMinutes: 50 });

    expect(dto.priceCents).toBe(22_000);
    expect(dto.currency).toBe('PLN');
    expect(dto.status).toBe('pending');
    expect(dto.startsAt).toBe(FAR_ENOUGH.toISOString());
    expect(dto.expiresAt).toBe(
      new Date(NOW.getTime() + BOOKING_HOLD_MINUTES * 60_000).toISOString(),
    );
    // The reservation is not yet a confirmation: nothing here stamps `bookedAt`.
    expect(h.created?.bookedAt).toBeNull();
    expect(h.created?.mentee).toEqual({ id: MENTEE_ID });
  });

  it('takes the 25-minute price when 25 minutes is asked for', async () => {
    const h = makeHarness();

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).resolves
      .toMatchObject({ priceCents: 12_000, lengthMinutes: 25 });
  });

  it('locks the slot row it is about to reserve', async () => {
    const h = makeHarness();

    await h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 });

    expect(h.tx.findOne).toHaveBeenNthCalledWith(
      1,
      Slot,
      { id: SLOT_ID, removedAt: null },
      expect.objectContaining({ lockMode: expect.anything() }),
    );
  });

  it('refuses a slot that does not exist or has been removed', async () => {
    const h = makeHarness({ storedSlot: null });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      NotFoundError,
    );
  });

  it(`accepts a start exactly ${MIN_LEAD_MINUTES} minutes away`, async () => {
    const h = makeHarness({
      storedSlot: slot({ startsAt: new Date(NOW.getTime() + MIN_LEAD_MINUTES * 60_000) }),
    });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).resolves
      .toMatchObject({ status: 'pending' });
  });

  it('refuses a start one millisecond inside the two-hour rule', async () => {
    const h = makeHarness({
      storedSlot: slot({ startsAt: new Date(NOW.getTime() + MIN_LEAD_MINUTES * 60_000 - 1) }),
    });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects
      .toMatchObject({ code: 'validation_failed', fieldErrors: { slotId: [LEAD_TIME_MESSAGE] } });
    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      ValidationError,
    );
  });

  it.each([
    ['an unpublished page', { publishedAt: null }],
    ['no 25-minute price', { price25Cents: null }],
    ['no 50-minute price', { price50Cents: null }],
  ])('refuses a mentor with %s', async (_label, overrides) => {
    const h = makeHarness({ storedSlot: slot({ mentorProfile: profile(overrides) }) });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects
      .toMatchObject({ code: 'conflict', message: MENTOR_NOT_BOOKABLE_MESSAGE });
  });
});

describe('BookingService.start slot arbitration', () => {
  it('refuses a slot a live hold still covers', async () => {
    const h = makeHarness({ held: heldBooking() });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects
      .toMatchObject({ code: 'conflict', message: SLOT_TAKEN_MESSAGE });
    expect(h.tx.create).not.toHaveBeenCalled();
  });

  it('refuses a slot someone already paid for', async () => {
    const h = makeHarness({ held: heldBooking({ status: 'confirmed', expiresAt: null }) });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      ConflictError,
    );
  });

  it('expires a lapsed hold in the same transaction and takes the slot', async () => {
    const lapsed = heldBooking({ expiresAt: new Date(NOW.getTime() - 1) });
    const h = makeHarness({ held: lapsed });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).resolves
      .toMatchObject({ status: 'pending' });
    expect(lapsed.status).toBe('expired');
    expect(lapsed.expiresAt).toBeNull();
  });

  it('treats a hold with no expiry at all as still live rather than as free', async () => {
    const h = makeHarness({ held: heldBooking({ expiresAt: null }) });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      ConflictError,
    );
  });

  it('turns a lost race on the unique index into the same refusal as the check', async () => {
    const h = makeHarness({
      onFlush: () => {
        throw uniqueViolation('bookings_active_slot_unique');
      },
    });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects
      .toMatchObject({ code: 'conflict', message: SLOT_TAKEN_MESSAGE });
  });

  it('lets an unrelated unique violation surface instead of reporting a taken slot', async () => {
    const h = makeHarness({
      onFlush: () => {
        throw uniqueViolation('some_other_unique');
      },
    });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      UniqueConstraintViolationException,
    );
  });

  it('lets a unique violation with no constraint name surface unchanged', async () => {
    const h = makeHarness({
      onFlush: () => {
        throw uniqueViolation();
      },
    });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      UniqueConstraintViolationException,
    );
  });

  it('lets an ordinary failure surface unchanged', async () => {
    const h = makeHarness({
      onFlush: () => {
        throw new Error('connection reset');
      },
    });

    await expect(h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 })).rejects.toThrow(
      'connection reset',
    );
  });

  it('asks for the slot and its hold, and creates exactly one booking', async () => {
    const h = makeHarness();

    await h.service.start({ slotId: SLOT_ID, lengthMinutes: 25 });

    expect(h.tx.findOne).toHaveBeenNthCalledWith(2, Booking, {
      slot: SLOT_ID,
      status: { $in: ['pending', 'confirmed'] },
    });
    expect(h.tx.create).toHaveBeenCalledTimes(1);
    expect(h.tx.persist).toHaveBeenCalledTimes(1);
  });
});

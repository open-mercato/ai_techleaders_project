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
import { MockPaymentGateway } from '../payments/adapters/mock-payment-gateway';
import {
  BOOKING_HOLD_MINUTES,
  BookingService,
  LEAD_TIME_MESSAGE,
  MENTOR_NOT_BOOKABLE_MESSAGE,
  NOT_CANCELLABLE_MESSAGE,
  SESSION_STARTED_MESSAGE,
  SLOT_TAKEN_MESSAGE,
  medianOf,
  toBookingDto,
  weekStartOf,
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
  feePercent: 20,
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
  gateway = new MockPaymentGateway(),
  onFlush,
}: {
  session?: Session | null | Promise<Session | null>;
  storedSlot?: ISlot | null;
  held?: IBooking | null;
  /** Explicit flag, not an `undefined` override: a default parameter would replace it. */
  withoutSettings?: boolean;
  gateway?: MockPaymentGateway;
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
  const eventBus = { emit: vi.fn(async () => undefined) };
  const logger = { error: vi.fn() };
  const service = new BookingService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    eventBus: eventBus as never,
    logger: logger as never,
    paymentGateway: gateway,
    session: session instanceof Promise ? session : Promise.resolve(session),
    platformSettingsService: withoutSettings
      ? undefined
      : { get: (): PlatformSettings => SETTINGS },
  });
  return {
    service,
    em,
    tx,
    eventBus,
    logger,
    gateway,
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

  it('still refuses a start that is already in the past', async () => {
    const h = makeHarness({
      storedSlot: slot({ startsAt: new Date(NOW.getTime() - 3 * 60 * 60_000) }),
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

describe('BookingService session lists', () => {
  const MENTOR_SESSION: Session = { userId: 'mentor-user', roles: ['mentor'] };

  function listed(overrides: Partial<IBooking> = {}): IBooking {
    return {
      id: BOOKING_ID,
      mentee: { id: MENTEE_ID, displayName: 'Ada Lovelace' },
      mentorProfile: profile(),
      lengthMinutes: 25,
      priceCents: 12_000,
      currency: 'PLN',
      status: 'confirmed',
      refundStatus: 'none',
      startsAt: FAR_ENOUGH,
      ...overrides,
    } as unknown as IBooking;
  }

  function listHarness(session: Session | null, bookings: IBooking[]) {
    const em = { find: vi.fn(async () => bookings) };
    const service = new BookingService({
      em: em as unknown as EntityManager,
      clock: { now: () => NOW },
      eventBus: { emit: vi.fn(async () => undefined) } as never,
      logger: { error: vi.fn() } as never,
      paymentGateway: new MockPaymentGateway(),
      session: Promise.resolve(session),
      platformSettingsService: { get: (): PlatformSettings => SETTINGS },
    });
    return { service, em };
  }

  it('shows a mentee the other person, soonest first, with the server view of time', async () => {
    const h = listHarness({ userId: MENTEE_ID, roles: ['mentee'] }, [listed()]);

    await expect(h.service.listForMentee()).resolves.toEqual([{
      id: BOOKING_ID,
      counterpartName: 'Mock Mentor',
      lengthMinutes: 25,
      priceCents: 12_000,
      currency: 'PLN',
      status: 'confirmed',
      refundStatus: 'none',
      startsAt: FAR_ENOUGH.toISOString(),
      isPast: false,
      cancellable: true,
      // FAR_ENOUGH is three hours out, so cancelling now would forfeit the fee.
      refundOnCancel: false,
    }]);
    expect(h.em.find).toHaveBeenCalledExactlyOnceWith(
      Booking,
      // The caller is the session, never a parameter.
      { mentee: MENTEE_ID },
      { populate: ['mentorProfile', 'mentorProfile.user'], orderBy: { startsAt: 'asc' } },
    );
  });

  it('counts a session that has already started as past, at the instant it starts', async () => {
    const h = listHarness({ userId: MENTEE_ID, roles: ['mentee'] }, [
      listed({ startsAt: NOW }),
      listed({ id: 'later', startsAt: new Date(NOW.getTime() + 1) }),
    ]);

    const sessions = await h.service.listForMentee();

    expect(sessions.map((session) => session.isPast)).toEqual([true, false]);
  });

  it('says whether cancelling right now would refund, so the screen can state it (R09)', async () => {
    const wellAhead = new Date(NOW.getTime() + 48 * 60 * 60 * 1000);
    const h = listHarness({ userId: MENTEE_ID, roles: ['mentee'] }, [
      listed({ startsAt: wellAhead }),
      listed({ id: 'soon', startsAt: new Date(NOW.getTime() + 60_000) }),
      listed({ id: 'unpaid', status: 'pending', startsAt: wellAhead }),
      listed({ id: 'done', startsAt: new Date(NOW.getTime() - 1) }),
    ]);

    const sessions = await h.service.listForMentee();

    expect(sessions.map((session) => [session.cancellable, session.refundOnCancel])).toEqual([
      [true, true],
      [true, false],
      // An unpaid hold is not cancellable: it releases its own time.
      [false, false],
      [false, false],
    ]);
  });

  it('keeps a mentee own unpaid hold visible to them', async () => {
    const h = listHarness({ userId: MENTEE_ID, roles: ['mentee'] }, [listed({ status: 'pending' })]);

    // A mentee who abandoned a checkout should see the hold, not wonder where it went.
    await expect(h.service.listForMentee()).resolves.toMatchObject([{ status: 'pending' }]);
  });

  it('shows a mentor the other person, scoped to bookings made with them', async () => {
    const h = listHarness(MENTOR_SESSION, [listed()]);

    await expect(h.service.listForMentor()).resolves.toMatchObject([
      { counterpartName: 'Ada Lovelace' },
    ]);
    expect(h.em.find).toHaveBeenCalledExactlyOnceWith(
      Booking,
      {
        mentorProfile: { user: 'mentor-user' },
        // A stranger's abandoned hold is not a session anyone booked with this mentor.
        status: { $in: ['confirmed', 'cancelled'] },
      },
      { populate: ['mentee'], orderBy: { startsAt: 'asc' } },
    );
  });

  it('refuses each list to a caller without that role, and to no session at all', async () => {
    await expect(listHarness(MENTOR_SESSION, []).service.listForMentee()).rejects
      .toThrow(ForbiddenError);
    await expect(
      listHarness({ userId: MENTEE_ID, roles: ['mentee'] }, []).service.listForMentor(),
    ).rejects.toThrow(ForbiddenError);
    await expect(listHarness(null, []).service.listForMentee()).rejects.toThrow(UnauthorizedError);
    await expect(listHarness(null, []).service.listForMentor()).rejects.toThrow(UnauthorizedError);
  });
});

describe('BookingService.cancelByMentee', () => {
  const MENTEE: Session = { userId: MENTEE_ID, roles: ['mentee'] };
  const START = new Date('2026-09-20T12:00:00.000Z');

  function confirmed(overrides: Partial<IBooking> = {}): IBooking {
    return {
      id: BOOKING_ID,
      mentee: { id: MENTEE_ID },
      mentorProfile: profile(),
      lengthMinutes: 25,
      priceCents: 12_000,
      currency: 'PLN',
      status: 'confirmed',
      refundStatus: 'none',
      startsAt: START,
      stripePaymentIntentId: 'pi_1',
      cancelledAt: null,
      stripeRefundId: null,
      refundedAmountCents: null,
      ...overrides,
    } as unknown as IBooking;
  }

  function cancelHarness({
    session = MENTEE as Session | null,
    stored = confirmed() as IBooking | null,
    now = new Date('2026-09-18T12:00:00.000Z'),
    gateway = new MockPaymentGateway(),
  } = {}) {
    const em = {
      findOne: vi.fn(async () => stored),
      transactional: vi.fn(async (run: (inner: unknown) => unknown) =>
        run({ findOne: async () => stored, flush: async () => undefined })),
    };
    const eventBus = { emit: vi.fn(async () => undefined) };
    const logger = { error: vi.fn() };
    const service = new BookingService({
      em: em as unknown as EntityManager,
      clock: { now: () => now },
      eventBus: eventBus as never,
      logger: logger as never,
      paymentGateway: gateway,
      session: Promise.resolve(session),
      platformSettingsService: { get: (): PlatformSettings => SETTINGS },
    });
    return { service, em, eventBus, logger, gateway, stored };
  }

  it('frees the time and refunds in full more than 24 hours out', async () => {
    const h = cancelHarness();

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toEqual({
      id: BOOKING_ID,
      status: 'cancelled',
      refundStatus: 'refunded',
      refundedAmountCents: 12_000,
    });
    expect(h.stored).toMatchObject({
      status: 'cancelled',
      refundStatus: 'refunded',
      stripeRefundId: 're_mock_000001',
      refundedAmountCents: 12_000,
    });
  });

  it('refunds at exactly 24 hours, because the rule names that moment', async () => {
    const h = cancelHarness({ now: new Date(START.getTime() - 24 * 60 * 60 * 1000) });

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toMatchObject({
      refundStatus: 'refunded',
    });
  });

  it('frees the time but refunds nothing one millisecond inside the window (D10)', async () => {
    const h = cancelHarness({ now: new Date(START.getTime() - 24 * 60 * 60 * 1000 + 1) });

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toEqual({
      id: BOOKING_ID,
      status: 'cancelled',
      // `none`, not `failed`: the fee is forfeit by decision, not by a refund going wrong.
      refundStatus: 'none',
      refundedAmountCents: 0,
    });
    expect(h.stored).toMatchObject({ status: 'cancelled', refundStatus: 'none' });
  });

  it('tells the mentor the time is free, saying whether a refund was owed', async () => {
    const free = cancelHarness();
    await free.service.cancelByMentee(BOOKING_ID);
    expect(free.eventBus.emit).toHaveBeenCalledExactlyOnceWith('bookings.booking.cancelled', {
      bookingId: BOOKING_ID,
      menteeId: MENTEE_ID,
      mentorProfileId: PROFILE_ID,
      startsAt: START.toISOString(),
      refunded: true,
    });

    const late = cancelHarness({ now: new Date(START.getTime() - 1_000) });
    await late.service.cancelByMentee(BOOKING_ID);
    expect(late.eventBus.emit).toHaveBeenCalledExactlyOnceWith(
      'bookings.booking.cancelled',
      expect.objectContaining({ refunded: false }),
    );
  });

  it('keys the refund on the booking, so a retry is the same refund', async () => {
    const gateway = new MockPaymentGateway();
    const first = cancelHarness({ gateway });
    await first.service.cancelByMentee(BOOKING_ID);

    const retry = cancelHarness({ gateway, stored: confirmed() });
    await expect(retry.service.cancelByMentee(BOOKING_ID)).resolves.toMatchObject({
      refundStatus: 'refunded',
    });
    // Same refund id both times: the provider was asked once.
    expect(retry.stored?.stripeRefundId).toBe('re_mock_000001');
  });

  it('leaves the session cancelled and the refund failed when the provider refuses', async () => {
    const gateway = new MockPaymentGateway();
    gateway.failNextCall(new Error('provider unreachable'));
    const h = cancelHarness({ gateway });

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toEqual({
      id: BOOKING_ID,
      status: 'cancelled',
      refundStatus: 'failed',
      refundedAmountCents: 0,
    });
    // Money owed and not returned is exactly the state an operator needs to see. Rolling
    // back a cancellation the mentee made and the mentor was told about would hide it.
    expect(h.stored).toMatchObject({ status: 'cancelled', refundStatus: 'failed' });
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BOOKING_ID }),
      'refund could not be completed',
    );
  });

  it('records a refund the provider has not settled yet as pending, not as money returned', async () => {
    const gateway = new MockPaymentGateway();
    vi.spyOn(gateway, 'refund').mockResolvedValue({ id: 're_1', status: 'pending' });
    const h = cancelHarness({ gateway });

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toMatchObject({
      refundStatus: 'pending',
      refundedAmountCents: 0,
    });
  });

  it('records a provider-reported failure as failed', async () => {
    const gateway = new MockPaymentGateway();
    vi.spyOn(gateway, 'refund').mockResolvedValue({ id: 're_1', status: 'failed' });
    const h = cancelHarness({ gateway });

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toMatchObject({
      refundStatus: 'failed',
    });
  });

  it('cannot refund a confirmed booking that carries no payment reference', async () => {
    const h = cancelHarness({ stored: confirmed({ stripePaymentIntentId: null }) });

    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toMatchObject({
      refundStatus: 'failed',
    });
    expect(h.logger.error).toHaveBeenCalled();
  });

  it('refuses a session that has already started, pointing at a quality dispute', async () => {
    const h = cancelHarness({ now: START });

    await expect(h.service.cancelByMentee(BOOKING_ID)).rejects.toMatchObject({
      code: 'conflict',
      message: SESSION_STARTED_MESSAGE,
    });
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it.each(['pending', 'cancelled', 'expired'] as const)(
    'refuses to cancel a %s booking',
    async (status) => {
      const h = cancelHarness({ stored: confirmed({ status }) });

      await expect(h.service.cancelByMentee(BOOKING_ID)).rejects.toMatchObject({
        code: 'conflict',
        message: NOT_CANCELLABLE_MESSAGE,
      });
    },
  );

  it('refuses somebody else booking, an unknown one, and a caller without the role', async () => {
    await expect(
      cancelHarness({ stored: confirmed({ mentee: { id: 'someone-else' } } as never) })
        .service.cancelByMentee(BOOKING_ID),
    ).rejects.toThrow(ForbiddenError);
    await expect(cancelHarness({ stored: null }).service.cancelByMentee(BOOKING_ID)).rejects
      .toThrow(NotFoundError);
    await expect(
      cancelHarness({ session: { userId: MENTEE_ID, roles: ['mentor'] } })
        .service.cancelByMentee(BOOKING_ID),
    ).rejects.toThrow(ForbiddenError);
  });

  it('still reports the refund when the booking vanished before it could be recorded', async () => {
    const h = cancelHarness();
    let transaction = 0;
    h.em.transactional.mockImplementation(async (run: (inner: unknown) => unknown) => {
      transaction += 1;
      // The cancellation commits; the row is gone by the time the refund is written back.
      return run({
        findOne: async () => (transaction === 1 ? h.stored : null),
        flush: async () => undefined,
      });
    });

    // The money still moved, so the caller is told what happened rather than being handed a
    // failure for a refund that succeeded.
    await expect(h.service.cancelByMentee(BOOKING_ID)).resolves.toMatchObject({
      refundStatus: 'refunded',
      refundedAmountCents: 12_000,
    });
  });

  it('survives the booking vanishing between the read and either write', async () => {
    const h = cancelHarness();
    // The cancelling transaction re-reads the row; a booking deleted in between is a
    // not-found rather than a write through nothing.
    h.em.transactional.mockImplementation(async (run: (inner: unknown) => unknown) =>
      run({ findOne: async () => null, flush: async () => undefined }));

    await expect(h.service.cancelByMentee(BOOKING_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('booking metrics', () => {
  const OPERATOR: Session = { userId: 'operator-1', roles: ['operator'] };

  function paid(bookedAt: string, startsAt: string, overrides: Partial<IBooking> = {}): IBooking {
    return {
      id: `booking-${bookedAt}`,
      status: 'confirmed',
      bookedAt: new Date(bookedAt),
      startsAt: new Date(startsAt),
      ...overrides,
    } as unknown as IBooking;
  }

  function metricsHarness(session: Session | null, bookings: IBooking[]) {
    const em = { find: vi.fn(async () => bookings) };
    const service = new BookingService({
      em: em as unknown as EntityManager,
      clock: { now: () => NOW },
      eventBus: { emit: vi.fn(async () => undefined) } as never,
      logger: { error: vi.fn() } as never,
      paymentGateway: new MockPaymentGateway(),
      session: Promise.resolve(session),
      platformSettingsService: { get: (): PlatformSettings => SETTINGS },
    });
    return { service, em };
  }

  it('starts every week on its Monday, including for a Sunday booking', () => {
    // Sunday 2026-09-20 belongs to the week that started on Monday the 14th.
    expect(weekStartOf(new Date('2026-09-20T23:59:59.000Z')).toISOString())
      .toBe('2026-09-14T00:00:00.000Z');
    expect(weekStartOf(new Date('2026-09-14T00:00:00.000Z')).toISOString())
      .toBe('2026-09-14T00:00:00.000Z');
    expect(weekStartOf(new Date('2026-09-21T08:00:00.000Z')).toISOString())
      .toBe('2026-09-21T00:00:00.000Z');
  });

  it('takes the middle value, averaging the two middles on an even count', () => {
    // A mean would be pulled by one mentee who booked three months ahead.
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([1, 2, 3, 4])).toBe(3);
    expect(medianOf([7])).toBe(7);
  });

  it('answers nothing rather than zero for an empty set', () => {
    // "No data" and "booked at the last moment" are different answers.
    expect(medianOf([])).toBeNull();
  });

  it('counts paid sessions by the week they were booked in (D16)', async () => {
    const h = metricsHarness(OPERATOR, [
      paid('2026-09-14T09:00:00.000Z', '2026-09-16T09:00:00.000Z'),
      paid('2026-09-20T09:00:00.000Z', '2026-09-22T09:00:00.000Z'),
      paid('2026-09-21T09:00:00.000Z', '2026-09-23T09:00:00.000Z'),
    ]);

    await expect(h.service.metricsForLastDays(28)).resolves
      .toMatchObject({
        weeks: [
          { weekStart: '2026-09-14', count: 2 },
          { weekStart: '2026-09-21', count: 1 },
        ],
      });
  });

  it('reports the median booking-to-start in whole minutes (D22, R15)', async () => {
    const h = metricsHarness(OPERATOR, [
      paid('2026-09-14T09:00:00.000Z', '2026-09-14T11:00:00.000Z'),
      paid('2026-09-15T09:00:00.000Z', '2026-09-16T09:00:00.000Z'),
      paid('2026-09-16T09:00:00.000Z', '2026-09-16T13:00:00.000Z'),
    ]);

    // 120, 1440 and 240 minutes: the middle is 240.
    await expect(h.service.metricsForLastDays(28)).resolves
      .toMatchObject({ medianBookingToStartMinutes: 240 });
  });

  it('measures the window from the server clock, not from an instant a caller sent', async () => {
    const h = metricsHarness(OPERATOR, []);

    await expect(h.service.metricsForLastDays(28)).resolves.toEqual({
      weeks: [],
      medianBookingToStartMinutes: null,
    });
    expect(h.em.find).toHaveBeenCalledExactlyOnceWith(
      Booking,
      // A cancelled session was paid and then refunded or forfeited: a different question.
      {
        status: 'confirmed',
        bookedAt: { $gte: new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000) },
      },
      { orderBy: { bookedAt: 'asc' } },
    );
  });

  it('skips a confirmed row with no booked-at rather than counting it as epoch', async () => {
    const h = metricsHarness(OPERATOR, [
      paid('2026-09-14T09:00:00.000Z', '2026-09-16T09:00:00.000Z'),
      { id: 'odd', status: 'confirmed', bookedAt: null, startsAt: NOW } as unknown as IBooking,
    ]);

    await expect(h.service.metricsForLastDays(28)).resolves
      .toMatchObject({ weeks: [{ weekStart: '2026-09-14', count: 1 }] });
  });

  it('refuses a caller who is not an operator, and one with no session', async () => {
    await expect(
      metricsHarness({ userId: 'u-1', roles: ['mentor'] }, []).service.metricsForLastDays(28),
    ).rejects.toThrow(ForbiddenError);
    await expect(metricsHarness(null, []).service.metricsForLastDays(28)).rejects
      .toThrow(UnauthorizedError);
  });
});

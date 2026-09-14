import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Booking,
  UniqueConstraintViolationException,
  type EntityManager,
  type IBooking,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { Session } from '../../http/auth';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../http/errors';
import { MockPaymentGateway } from './adapters/mock-payment-gateway';
import {
  HOLD_EXPIRED_MESSAGE,
  NOT_PAYABLE_MESSAGE,
  PaymentService,
  checkoutReturnUrls,
} from './payment.service';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const MENTEE_ID = '10000000-0000-4000-8000-000000000001';
const PROFILE_ID = '30000000-0000-4000-8000-000000000001';
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';
const APP_URL = 'https://devmentor.test';

function booking(overrides: Partial<IBooking> = {}): IBooking {
  return {
    id: BOOKING_ID,
    mentee: { id: MENTEE_ID },
    mentorProfile: { id: PROFILE_ID, slug: 'mock-mentor', user: { displayName: 'Mock Mentor' } },
    lengthMinutes: 25,
    priceCents: 12_000,
    currency: 'PLN',
    status: 'pending',
    startsAt: new Date('2026-09-14T15:00:00.000Z'),
    expiresAt: new Date('2026-09-14T12:30:00.000Z'),
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    bookedAt: null,
    amountPaidCents: null,
    paymentIssue: null,
    ...overrides,
  } as unknown as IBooking;
}

function makeHarness({
  session = { userId: MENTEE_ID, roles: ['mentee'] } as Session | null | Promise<Session | null>,
  stored = booking(),
  gateway = new MockPaymentGateway(),
}: {
  session?: Session | null | Promise<Session | null>;
  stored?: IBooking | null;
  gateway?: MockPaymentGateway;
} = {}) {
  const em = {
    findOne: vi.fn(async () => stored),
    flush: vi.fn(async () => undefined),
  };
  const eventBus = { emit: vi.fn(async () => undefined) };
  const service = new PaymentService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    env: { APP_URL } as AppEnv,
    eventBus: eventBus as never,
    paymentGateway: gateway,
    session: session instanceof Promise ? session : Promise.resolve(session),
  });
  return { service, em, eventBus, gateway, stored };
}

function uniqueViolation(constraint?: string): UniqueConstraintViolationException {
  const error = Object.create(UniqueConstraintViolationException.prototype) as
    UniqueConstraintViolationException & { constraint?: string };
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

beforeEach(() => vi.clearAllMocks());

describe('checkoutReturnUrls', () => {
  it('sends a payer to their sessions and an abandoner back to the mentor page', () => {
    expect(checkoutReturnUrls(APP_URL, booking())).toEqual({
      successUrl: `${APP_URL}/home?booked=${BOOKING_ID}`,
      cancelUrl: `${APP_URL}/m/mock-mentor`,
    });
  });

  it('escapes a slug so it cannot add a second query parameter', () => {
    const urls = checkoutReturnUrls(
      APP_URL,
      booking({ mentorProfile: { slug: 'a b?c' } } as unknown as Partial<IBooking>),
    );

    expect(urls.cancelUrl).toBe(`${APP_URL}/m/a%20b%3Fc`);
  });
});

describe('PaymentService.startCheckout authorization', () => {
  it('refuses a caller with no session', async () => {
    await expect(makeHarness({ session: null }).service.startCheckout(BOOKING_ID)).rejects
      .toThrow(UnauthorizedError);
  });

  it('surfaces a session that could not be resolved without leaving it unhandled', async () => {
    const failure = new Error('session store unreachable');
    const h = makeHarness({ session: Promise.reject(failure) });

    // The constructor attaches its own catch, so an unawaited rejection cannot crash the
    // process; `startCheckout` still reports the failure to its caller.
    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toBe(failure);
  });

  it('refuses a signed-in caller who is not a mentee', async () => {
    const h = makeHarness({ session: { userId: MENTEE_ID, roles: ['mentor'] } });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toThrow(ForbiddenError);
  });

  it('refuses to pay for somebody else booking', async () => {
    const h = makeHarness({ stored: booking({ mentee: { id: 'someone-else' } } as never) });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toThrow(ForbiddenError);
  });

  it('refuses a booking that does not exist', async () => {
    const h = makeHarness({ stored: null });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('PaymentService.startCheckout', () => {
  it('opens a checkout at the booking own price, expiring with the hold', async () => {
    const h = makeHarness();

    const started = await h.service.startCheckout(BOOKING_ID);

    expect(started).toEqual({
      bookingId: BOOKING_ID,
      checkoutSessionId: 'cs_mock_000001',
      url: `${APP_URL}/home?booked=${BOOKING_ID}`,
    });
    expect(h.gateway.sessionRequest('cs_mock_000001')).toEqual({
      bookingId: BOOKING_ID,
      // From the booking, never from the caller: there is no amount in the request at all.
      amountCents: 12_000,
      currency: 'PLN',
      successUrl: `${APP_URL}/home?booked=${BOOKING_ID}`,
      cancelUrl: `${APP_URL}/m/mock-mentor`,
      // Exactly the booking's own hold, so the provider and this database cannot disagree
      // about who owns the slot.
      expiresAt: new Date('2026-09-14T12:30:00.000Z'),
      description: '25-minute text session with Mock Mentor',
    });
  });

  it('records the session on the booking, so a webhook can find it', async () => {
    const h = makeHarness();

    await h.service.startCheckout(BOOKING_ID);

    expect(h.stored?.stripeCheckoutSessionId).toBe('cs_mock_000001');
    expect(h.em.flush).toHaveBeenCalledOnce();
    expect(h.em.findOne).toHaveBeenCalledWith(
      Booking,
      { id: BOOKING_ID },
      { populate: ['mentee', 'mentorProfile', 'mentorProfile.user'] },
    );
  });

  it.each(['confirmed', 'cancelled', 'expired'] as const)(
    'refuses a %s booking as not waiting for payment',
    async (status) => {
      const h = makeHarness({ stored: booking({ status }) });

      await expect(h.service.startCheckout(BOOKING_ID)).rejects.toMatchObject({
        code: 'conflict',
        message: NOT_PAYABLE_MESSAGE,
      });
    },
  );

  it('refuses a hold that lapsed while the mentee thought about it', async () => {
    const h = makeHarness({ stored: booking({ expiresAt: new Date(NOW.getTime() - 1) }) });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toMatchObject({
      code: 'conflict',
      message: HOLD_EXPIRED_MESSAGE,
    });
  });

  it('refuses at the exact instant the hold expires', async () => {
    const h = makeHarness({ stored: booking({ expiresAt: NOW }) });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toThrow(ConflictError);
  });

  it('refuses a pending booking carrying no hold at all rather than paying open-ended', async () => {
    const h = makeHarness({ stored: booking({ expiresAt: null }) });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toMatchObject({
      message: HOLD_EXPIRED_MESSAGE,
    });
  });

  it('leaves the booking pending and unrecorded when the gateway fails', async () => {
    const gateway = new MockPaymentGateway();
    gateway.failNextCall(new Error('provider unreachable'));
    const h = makeHarness({ gateway });

    await expect(h.service.startCheckout(BOOKING_ID)).rejects.toThrow('provider unreachable');
    expect(h.stored?.status).toBe('pending');
    expect(h.stored?.stripeCheckoutSessionId).toBeNull();
    expect(h.em.flush).not.toHaveBeenCalled();
  });
});

describe('PaymentService.handleWebhookEvent', () => {
  const completed = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    checkoutSessionId: 'cs_mock_000001',
    paymentIntentId: 'pi_1',
    amountTotalCents: 12_000,
    currency: 'PLN',
  } as const;

  function webhookHarness({
    stored = booking({ stripeCheckoutSessionId: 'cs_mock_000001' }),
    onFlush,
  }: { stored?: IBooking | null; onFlush?: () => void } = {}) {
    const recorded: Record<string, unknown>[] = [];
    const tx = {
      create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
        recorded.push(data);
        return data;
      }),
      persist: vi.fn(),
      flush: vi.fn(async () => onFlush?.()),
      findOne: vi.fn(async () => stored),
    };
    const em = {
      transactional: vi.fn(async (run: (inner: typeof tx) => unknown) => run(tx)),
    };
    const eventBus = { emit: vi.fn(async () => undefined) };
    const service = new PaymentService({
      em: em as unknown as EntityManager,
      clock: { now: () => NOW },
      env: { APP_URL } as AppEnv,
      eventBus: eventBus as never,
      paymentGateway: new MockPaymentGateway(),
      session: Promise.resolve(null),
    });
    return { service, tx, eventBus, stored, recorded };
  }

  it('confirms the booking, stamps booking-to-start, and releases the hold', async () => {
    const h = webhookHarness();

    await expect(h.service.handleWebhookEvent(completed)).resolves.toBe('confirmed');

    expect(h.stored).toMatchObject({
      status: 'confirmed',
      bookedAt: NOW,
      paidAt: NOW,
      amountPaidCents: 12_000,
      stripePaymentIntentId: 'pi_1',
      paymentIssue: null,
      // The hold is over: the slot is held by a confirmed booking now, not by a timer.
      expiresAt: null,
    });
  });

  it('records the delivery before it acts on it', async () => {
    const h = webhookHarness();

    await h.service.handleWebhookEvent(completed);

    expect(h.recorded[0]).toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
      receivedAt: NOW,
    });
    // Recorded first, booking looked up second.
    expect(h.tx.create.mock.invocationCallOrder[0]!)
      .toBeLessThan(h.tx.findOne.mock.invocationCallOrder[0]!);
  });

  it('announces the confirmation after the transaction, never inside it', async () => {
    const h = webhookHarness();

    await h.service.handleWebhookEvent(completed);

    expect(h.eventBus.emit).toHaveBeenCalledExactlyOnceWith('bookings.booking.confirmed', {
      bookingId: BOOKING_ID,
      menteeId: MENTEE_ID,
      mentorProfileId: PROFILE_ID,
      startsAt: '2026-09-14T15:00:00.000Z',
      lengthMinutes: 25,
    });
    // A subscriber that sent mail inside the transaction would announce a booking a
    // rollback then erased.
    expect(h.tx.flush.mock.invocationCallOrder.at(-1)!)
      .toBeLessThan(h.eventBus.emit.mock.invocationCallOrder[0]!);
  });

  it('treats a redelivered event as a no-op and announces nothing', async () => {
    const h = webhookHarness({
      onFlush: () => {
        throw uniqueViolation('processed_webhook_events_event_id_unique');
      },
    });

    await expect(h.service.handleWebhookEvent(completed)).resolves.toBe('duplicate');
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it('lets an unrelated unique violation surface rather than reporting a redelivery', async () => {
    const h = webhookHarness({
      onFlush: () => {
        throw uniqueViolation('some_other_unique');
      },
    });

    await expect(h.service.handleWebhookEvent(completed)).rejects
      .toThrow(UniqueConstraintViolationException);
  });

  it('lets a unique violation with no constraint name surface unchanged', async () => {
    const h = webhookHarness({ onFlush: () => { throw uniqueViolation(); } });

    await expect(h.service.handleWebhookEvent(completed)).rejects
      .toThrow(UniqueConstraintViolationException);
  });

  it('lets an ordinary database failure surface rather than reporting a redelivery', async () => {
    const h = webhookHarness({ onFlush: () => { throw new Error('connection reset'); } });

    await expect(h.service.handleWebhookEvent(completed)).rejects.toThrow('connection reset');
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it('refuses an amount that is not the mentor price, and flags it (R08)', async () => {
    const h = webhookHarness();

    await expect(
      h.service.handleWebhookEvent({ ...completed, amountTotalCents: 1 }),
    ).resolves.toBe('amount_mismatch');

    expect(h.stored).toMatchObject({
      status: 'pending',
      paymentIssue: 'amount_mismatch',
      amountPaidCents: 1,
      stripePaymentIntentId: 'pi_1',
      bookedAt: null,
    });
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it('answers a session no booking claims without changing anything', async () => {
    const h = webhookHarness({ stored: null });

    await expect(h.service.handleWebhookEvent(completed)).resolves.toBe('unknown_booking');
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it('confirms once when the same payment arrives after the booking is already confirmed', async () => {
    const h = webhookHarness({ stored: booking({ status: 'confirmed' }) });

    await expect(h.service.handleWebhookEvent(completed)).resolves.toBe('already_confirmed');
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'expired'] as const)(
    'does not resurrect a %s booking from a late payment',
    async (status) => {
      const h = webhookHarness({ stored: booking({ status }) });

      await expect(h.service.handleWebhookEvent(completed)).resolves.toBe('not_pending');
      expect(h.stored?.status).toBe(status);
    },
  );

  it('acknowledges an event type the product does not act on, keeping the record', async () => {
    const h = webhookHarness();

    await expect(
      h.service.handleWebhookEvent({ id: 'evt_9', type: 'unhandled', rawType: 'invoice.paid' }),
    ).resolves.toBe('ignored');

    // Recorded under the provider's own type, so "received and ignored" stays tellable
    // from "never received".
    expect(h.recorded[0]).toMatchObject({ eventId: 'evt_9', type: 'invoice.paid' });
    expect(h.tx.findOne).not.toHaveBeenCalled();
  });
});

describe('PaymentService.expirePending', () => {
  function sweepHarness(lapsed: IBooking[]) {
    const tx = {
      find: vi.fn(async () => lapsed),
      flush: vi.fn(async () => undefined),
    };
    const em = { transactional: vi.fn(async (run: (inner: typeof tx) => unknown) => run(tx)) };
    const service = new PaymentService({
      em: em as unknown as EntityManager,
      clock: { now: () => NOW },
      env: { APP_URL } as AppEnv,
      eventBus: { emit: vi.fn(async () => undefined) } as never,
      paymentGateway: new MockPaymentGateway(),
      session: Promise.resolve(null),
    });
    return { service, tx };
  }

  it('releases every lapsed hold and clears its deadline', async () => {
    const lapsed = [
      booking({ id: 'a', expiresAt: new Date(NOW.getTime() - 1) }),
      booking({ id: 'b', expiresAt: NOW }),
    ];
    const h = sweepHarness(lapsed);

    await expect(h.service.expirePending(NOW)).resolves.toBe(2);

    for (const released of lapsed) {
      // Expired drops the row out of the partial unique index, so the slot is bookable
      // again; a terminal row carrying a deadline would read like a hold still honoured.
      expect(released.status).toBe('expired');
      expect(released.expiresAt).toBeNull();
    }
  });

  it('asks only for pending bookings whose deadline has passed', async () => {
    const h = sweepHarness([]);

    await expect(h.service.expirePending(NOW)).resolves.toBe(0);

    expect(h.tx.find).toHaveBeenCalledExactlyOnceWith(Booking, {
      status: 'pending',
      expiresAt: { $lte: NOW },
    });
  });
});

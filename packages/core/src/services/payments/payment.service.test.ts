import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Booking, type EntityManager, type IBooking } from '@devmentor/db';
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
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';
const APP_URL = 'https://devmentor.test';

function booking(overrides: Partial<IBooking> = {}): IBooking {
  return {
    id: BOOKING_ID,
    mentee: { id: MENTEE_ID },
    mentorProfile: { slug: 'mock-mentor', user: { displayName: 'Mock Mentor' } },
    lengthMinutes: 25,
    priceCents: 12_000,
    currency: 'PLN',
    status: 'pending',
    startsAt: new Date('2026-09-14T15:00:00.000Z'),
    expiresAt: new Date('2026-09-14T12:30:00.000Z'),
    stripeCheckoutSessionId: null,
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
  const service = new PaymentService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    env: { APP_URL } as AppEnv,
    paymentGateway: gateway,
    session: session instanceof Promise ? session : Promise.resolve(session),
  });
  return { service, em, gateway, stored };
}

beforeEach(() => vi.clearAllMocks());

describe('checkoutReturnUrls', () => {
  it('sends a payer to their sessions and an abandoner back to the mentor page', () => {
    expect(checkoutReturnUrls(APP_URL, booking())).toEqual({
      successUrl: `${APP_URL}/sessions?booked=${BOOKING_ID}`,
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
      url: `${APP_URL}/sessions?booked=${BOOKING_ID}`,
    });
    expect(h.gateway.sessionRequest('cs_mock_000001')).toEqual({
      bookingId: BOOKING_ID,
      // From the booking, never from the caller: there is no amount in the request at all.
      amountCents: 12_000,
      currency: 'PLN',
      successUrl: `${APP_URL}/sessions?booked=${BOOKING_ID}`,
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

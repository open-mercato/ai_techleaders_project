import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Booking,
  Payout,
  UniqueConstraintViolationException,
  type EntityManager,
  type IBooking,
  type IPayout,
} from '@devmentor/db';
import type { Logger } from '../../logger';
import type { Session } from '../../http/auth';
import { ForbiddenError, UnauthorizedError } from '../../http/errors';
import { MockPaymentGateway } from './adapters/mock-payment-gateway';
import { PayoutService, toPayoutDto } from './payout.service';

const NOW = new Date('2026-09-20T12:00:00.000Z');
const MENTOR_USER_ID = '10000000-0000-4000-8000-000000000002';
const PROFILE_ID = '30000000-0000-4000-8000-000000000001';
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function booking(overrides: Partial<IBooking> = {}): IBooking {
  return {
    id: BOOKING_ID,
    mentorProfile: {
      id: PROFILE_ID,
      payoutsEnabled: true,
      stripeConnectAccountId: 'acct_1',
    },
    lengthMinutes: 25,
    priceCents: 12_000,
    currency: 'PLN',
    status: 'confirmed',
    refundStatus: 'none',
    // Ended half an hour ago.
    startsAt: new Date(NOW.getTime() - 55 * 60_000),
    platformFeeCents: 2_400,
    mentorShareCents: 9_600,
    ...overrides,
  } as unknown as IBooking;
}

function makeHarness({
  due = [booking()] as IBooking[],
  session = null as Session | null,
  payouts = [] as IPayout[],
  gateway = new MockPaymentGateway(),
  onCreate,
}: {
  due?: IBooking[];
  session?: Session | null;
  payouts?: IPayout[];
  gateway?: MockPaymentGateway;
  onCreate?: () => void;
} = {}) {
  let sequence = 0;
  const created: IPayout[] = [];
  const em = {
    find: vi.fn(async (entity: unknown) => (entity === Booking ? due : payouts)),
    flush: vi.fn(async () => undefined),
    transactional: vi.fn(async (run: (inner: unknown) => unknown) =>
      run({
        create: (_entity: unknown, data: Record<string, unknown>) => {
          sequence += 1;
          const payout = { id: `payout-${sequence}`, ...data } as unknown as IPayout;
          created.push(payout);
          return payout;
        },
        persist: vi.fn(),
        flush: async () => onCreate?.(),
      })),
  };
  const logger = { error: vi.fn() } as unknown as Logger;
  const service = new PayoutService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    logger,
    paymentGateway: gateway,
    session: Promise.resolve(session),
  });
  return { service, em, logger, gateway, created };
}

function uniqueViolation(constraint?: string): UniqueConstraintViolationException {
  const error = Object.create(UniqueConstraintViolationException.prototype) as
    UniqueConstraintViolationException & { constraint?: string };
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

beforeEach(() => vi.clearAllMocks());

describe('payout projection', () => {
  it('shows the share alongside the price and the fee, so it is checkable', () => {
    const payout = {
      id: 'payout-1',
      amountCents: 9_600,
      status: 'transferred',
      heldReason: null,
    } as unknown as IPayout;

    expect(toPayoutDto(payout, booking())).toEqual({
      id: 'payout-1',
      bookingId: BOOKING_ID,
      amountCents: 9_600,
      status: 'transferred',
      heldReason: null,
      sessionStartsAt: booking().startsAt.toISOString(),
      priceCents: 12_000,
      platformFeeCents: 2_400,
      currency: 'PLN',
    });
  });

  it('reports a missing fee as zero rather than as absent', () => {
    const payout = { id: 'p', amountCents: 0, status: 'held', heldReason: null } as unknown as IPayout;

    expect(toPayoutDto(payout, booking({ platformFeeCents: null })).platformFeeCents).toBe(0);
  });
});

describe('PayoutService.runDue', () => {
  it('asks only for confirmed, unrefunded sessions with no payout yet', async () => {
    const h = makeHarness();

    await h.service.runDue();

    // A refunded or cancelled session is never selected, which is how "a refunded session
    // takes no fee" holds — by not creating the payout, rather than reversing one.
    expect(h.em.find).toHaveBeenCalledWith(
      Booking,
      { status: 'confirmed', refundStatus: 'none', payout: null },
      { populate: ['mentorProfile'] },
    );
  });

  it('transfers the mentor share and records the transfer', async () => {
    const h = makeHarness();

    await expect(h.service.runDue()).resolves.toEqual({ transferred: 1, held: 0, failed: 0 });

    expect(h.gateway.transferRequests).toEqual([{
      amountCents: 9_600,
      currency: 'PLN',
      destinationAccountId: 'acct_1',
      // The payout id: a re-run sends the same transfer, not a second one.
      idempotencyKey: 'payout-1',
      transferGroup: BOOKING_ID,
    }]);
    expect(h.created[0]).toMatchObject({
      status: 'transferred',
      stripeTransferId: 'tr_mock_000001',
      heldReason: null,
    });
  });

  it('holds a payout for a mentor who has not finished Connect onboarding', async () => {
    const h = makeHarness({
      due: [booking({
        mentorProfile: { id: PROFILE_ID, payoutsEnabled: false, stripeConnectAccountId: null },
      } as never)],
    });

    await expect(h.service.runDue()).resolves.toEqual({ transferred: 0, held: 1, failed: 0 });

    // Owed and unsent is a row, not an absence: "nobody has been paid" and "nothing was
    // owed" must not look the same.
    expect(h.created[0]).toMatchObject({
      status: 'held',
      heldReason: 'connect_onboarding_incomplete',
      amountCents: 9_600,
    });
    expect(h.gateway.transferRequests).toEqual([]);
  });

  it('holds a payout for a mentor marked enabled but with no account to send to', async () => {
    const h = makeHarness({
      due: [booking({
        mentorProfile: { id: PROFILE_ID, payoutsEnabled: true, stripeConnectAccountId: null },
      } as never)],
    });

    await expect(h.service.runDue()).resolves.toMatchObject({ held: 1 });
  });

  it('leaves a session that has not finished for the next run', async () => {
    const h = makeHarness({
      due: [booking({ startsAt: new Date(NOW.getTime() - 24 * 60_000) })],
    });

    // Paying before the end would send money for a session the mentee could still have
    // cancelled.
    await expect(h.service.runDue()).resolves.toEqual({ transferred: 0, held: 0, failed: 0 });
    expect(h.created).toEqual([]);
  });

  it('pays a session at the exact minute it ends', async () => {
    const h = makeHarness({
      due: [booking({ startsAt: new Date(NOW.getTime() - 25 * 60_000) })],
    });

    await expect(h.service.runDue()).resolves.toMatchObject({ transferred: 1 });
  });

  it('records a failed transfer and leaves it for the next run', async () => {
    const gateway = new MockPaymentGateway();
    gateway.failNextCall(new Error('connect account restricted'));
    const h = makeHarness({ gateway });

    await expect(h.service.runDue()).resolves.toEqual({ transferred: 0, held: 0, failed: 1 });

    expect(h.created[0]).toMatchObject({ status: 'failed' });
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BOOKING_ID }),
      'payout transfer failed',
    );
  });

  it('lets a concurrent run win the row rather than paying twice', async () => {
    const h = makeHarness({
      onCreate: () => {
        throw uniqueViolation('payouts_booking_id_unique');
      },
    });

    await expect(h.service.runDue()).resolves.toEqual({ transferred: 0, held: 0, failed: 0 });
    expect(h.gateway.transferRequests).toEqual([]);
  });

  it('lets an unrelated failure surface rather than reporting nothing happened', async () => {
    await expect(
      makeHarness({ onCreate: () => { throw uniqueViolation('some_other_unique'); } })
        .service.runDue(),
    ).rejects.toThrow(UniqueConstraintViolationException);
    await expect(
      makeHarness({ onCreate: () => { throw uniqueViolation(); } }).service.runDue(),
    ).rejects.toThrow(UniqueConstraintViolationException);
    await expect(
      makeHarness({ onCreate: () => { throw new Error('connection reset'); } }).service.runDue(),
    ).rejects.toThrow('connection reset');
  });

  it('pays a session with no recorded share nothing, rather than guessing', async () => {
    const h = makeHarness({ due: [booking({ mentorShareCents: null })] });

    await h.service.runDue();

    expect(h.created[0]).toMatchObject({ amountCents: 0 });
  });

  it('runs against the clock when no instant is supplied', async () => {
    const h = makeHarness();

    await expect(h.service.runDue()).resolves.toMatchObject({ transferred: 1 });
  });
});

describe('PayoutService.listForMentor', () => {
  it('answers from the session, never from a parameter', async () => {
    const stored = {
      id: 'payout-1',
      amountCents: 9_600,
      status: 'held',
      heldReason: 'connect_onboarding_incomplete',
      booking: booking(),
    } as unknown as IPayout;
    const h = makeHarness({
      session: { userId: MENTOR_USER_ID, roles: ['mentor'] },
      payouts: [stored],
    });

    await expect(h.service.listForMentor()).resolves.toEqual([toPayoutDto(stored, booking())]);
    expect(h.em.find).toHaveBeenCalledWith(
      Payout,
      { mentorProfile: { user: MENTOR_USER_ID } },
      { populate: ['booking'], orderBy: { createdAt: 'desc' }, limit: 200 },
    );
  });

  it('surfaces a session that could not be resolved without leaving it unhandled', async () => {
    const failure = new Error('session store unreachable');
    const service = new PayoutService({
      em: { find: vi.fn(async () => []) } as unknown as EntityManager,
      clock: { now: () => NOW },
      logger: { error: vi.fn() } as unknown as Logger,
      paymentGateway: new MockPaymentGateway(),
      // The constructor attaches its own catch, so an unawaited rejection cannot crash the
      // process; the read still reports the failure to its caller.
      session: Promise.reject(failure),
    });

    await expect(service.listForMentor()).rejects.toBe(failure);
  });

  it('refuses a caller with no session, and one without the mentor role', async () => {
    await expect(makeHarness().service.listForMentor()).rejects.toThrow(UnauthorizedError);
    await expect(
      makeHarness({ session: { userId: MENTOR_USER_ID, roles: ['mentee'] } })
        .service.listForMentor(),
    ).rejects.toThrow(ForbiddenError);
  });
});

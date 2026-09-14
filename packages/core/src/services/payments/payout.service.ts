import {
  Booking,
  Payout,
  UniqueConstraintViolationException,
  type EntityManager,
  type IBooking,
  type IPayout,
} from '@devmentor/db';
import type { Logger } from '../../logger';
import { requireRole, type Session } from '../../http/auth';
import { UnauthorizedError } from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { PaymentGateway } from './payment-gateway.port';

const PAYOUT_BOOKING_CONSTRAINT = 'payouts_booking_id_unique';

export interface PayoutRunSummary {
  transferred: number;
  held: number;
  failed: number;
}

export interface PayoutDto {
  id: string;
  bookingId: string;
  amountCents: number;
  status: string;
  heldReason: string | null;
  sessionStartsAt: string;
  /** What the session cost and what DevMentor kept, so the share is checkable. */
  priceCents: number;
  platformFeeCents: number;
  currency: string;
}

export function toPayoutDto(payout: IPayout, booking: IBooking): PayoutDto {
  return {
    id: payout.id,
    bookingId: booking.id,
    amountCents: payout.amountCents,
    status: payout.status,
    heldReason: payout.heldReason ?? null,
    sessionStartsAt: booking.startsAt.toISOString(),
    priceCents: booking.priceCents,
    platformFeeCents: booking.platformFeeCents ?? 0,
    currency: booking.currency,
  };
}

export class PayoutService {
  private readonly em: EntityManager;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly paymentGateway: PaymentGateway;
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    clock,
    logger,
    paymentGateway,
    session,
  }: {
    em: EntityManager;
    clock: Clock;
    logger: Logger;
    paymentGateway: PaymentGateway;
    session: Promise<Session | null>;
  }) {
    // Destructure the PROXY cradle synchronously — resolving a key after an await can reach
    // a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.logger = logger;
    this.paymentGateway = paymentGateway;
    this.session = session;
    void session.catch(() => undefined);
  }

  /**
   * Pay every mentor whose session has finished, and hold the rest (#25).
   *
   * **Due** is deliberate and narrow: a booking is `confirmed`, was never refunded, its
   * session has ended (`startsAt + lengthMinutes <= now`), and it has no payout row. A
   * cancelled or refunded session is simply not selected, which is how "a refunded session
   * takes no fee" is enforced — by never creating the payout, rather than by creating one
   * and reversing it.
   *
   * **Waiting until the session has ended is the point.** Paying at confirmation would send
   * money for a session that has not happened and that the mentee may still cancel; the
   * cancellation window closes before the start, so by the end there is nothing left to
   * take back.
   *
   * The payout row is written **before** the transfer is attempted, and its id is the
   * transfer's idempotency key. A run that dies mid-transfer therefore leaves a row an
   * operator can see and the next run can retry, and the unique index on `booking` means a
   * second concurrent run cannot create a second payout for the same session.
   */
  async runDue(now: Date = this.clock.now()): Promise<PayoutRunSummary> {
    const due = await this.em.find(
      Booking,
      {
        status: 'confirmed',
        refundStatus: 'none',
        payout: null,
      },
      { populate: ['mentorProfile'] },
    );

    const summary: PayoutRunSummary = { transferred: 0, held: 0, failed: 0 };
    for (const booking of due) {
      if (!hasEnded(booking, now)) continue;
      const outcome = await this.payOne(booking);
      if (outcome !== null) summary[outcome] += 1;
    }
    return summary;
  }

  /** One session's payout. Returns `null` when another run got there first. */
  private async payOne(booking: IBooking): Promise<keyof PayoutRunSummary | null> {
    const profile = booking.mentorProfile;
    const enabled = profile.payoutsEnabled && profile.stripeConnectAccountId != null;

    let payout: IPayout;
    try {
      payout = await this.em.transactional(async (tx) => {
        const created = tx.create(Payout, {
          booking,
          mentorProfile: profile,
          amountCents: booking.mentorShareCents ?? 0,
          status: 'held',
          heldReason: enabled ? null : 'connect_onboarding_incomplete',
          stripeTransferId: null,
        });
        tx.persist(created);
        await tx.flush();
        return created;
      });
    } catch (error) {
      if (constraintName(error) === PAYOUT_BOOKING_CONSTRAINT) return null;
      throw error;
    }

    if (!enabled) {
      // Owed and unsent, with the reason on the row. The mentor is told by the caller.
      return 'held';
    }

    try {
      const transfer = await this.paymentGateway.transfer({
        amountCents: payout.amountCents,
        currency: booking.currency,
        destinationAccountId: profile.stripeConnectAccountId as string,
        // The payout id: a re-run sends the same transfer, not a second one.
        idempotencyKey: payout.id,
        transferGroup: booking.id,
      });
      payout.status = 'transferred';
      payout.stripeTransferId = transfer.id;
      payout.heldReason = null;
      await this.em.flush();
      return 'transferred';
    } catch (error) {
      this.logger.error(
        { err: error, payoutId: payout.id, bookingId: booking.id },
        'payout transfer failed',
      );
      payout.status = 'failed';
      await this.em.flush();
      return 'failed';
    }
  }

  /** The signed-in mentor's own payouts, newest session first. */
  async listForMentor(): Promise<PayoutDto[]> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    requireRole(session, 'mentor');

    const payouts = await this.em.find(
      Payout,
      { mentorProfile: { user: session.userId } },
      { populate: ['booking'], orderBy: { createdAt: 'desc' }, limit: 200 },
    );
    return payouts.map((payout) => toPayoutDto(payout, payout.booking));
  }
}

/** A session is over once its length has elapsed from its start. */
function hasEnded(booking: IBooking, now: Date): boolean {
  return booking.startsAt.getTime() + booking.lengthMinutes * 60_000 <= now.getTime();
}

function constraintName(error: unknown): string | null {
  if (!(error instanceof UniqueConstraintViolationException)) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

import {
  Booking,
  ProcessedWebhookEvent,
  UniqueConstraintViolationException,
  type EntityManager,
  type IBooking,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import { assertOwnership, requireRole, type Session } from '../../http/auth';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { EventBus } from '../../events/event-bus';
import type { GatewayEvent, PaymentGateway } from './payment-gateway.port';

export const HOLD_EXPIRED_MESSAGE =
  'This reservation has expired. Choose an available time to start a new booking.';
export const NOT_PAYABLE_MESSAGE = 'This booking is not waiting for payment.';

const PROCESSED_EVENT_CONSTRAINT = 'processed_webhook_events_event_id_unique';

/**
 * What a delivery did, for the webhook route to log. Every value is a real outcome the
 * operator reconciling a payment may need to tell apart, which is why `duplicate` is not
 * folded into `confirmed`: "we saw this twice" and "we confirmed twice" are different
 * facts, and only one of them would be a defect.
 */
export type WebhookOutcome =
  | 'confirmed'
  | 'duplicate'
  | 'already_confirmed'
  | 'unknown_booking'
  | 'amount_mismatch'
  | 'not_pending'
  | 'ignored';

export interface StartedCheckout {
  bookingId: string;
  checkoutSessionId: string;
  url: string;
}

/** Where a paid mentee lands, and where an abandoned Checkout returns them. */
export function checkoutReturnUrls(appUrl: string, booking: IBooking): {
  successUrl: string;
  cancelUrl: string;
} {
  return {
    successUrl: `${appUrl}/sessions?booked=${encodeURIComponent(booking.id)}`,
    cancelUrl: `${appUrl}/m/${encodeURIComponent(booking.mentorProfile.slug as string)}`,
  };
}

export class PaymentService {
  private readonly em: EntityManager;
  private readonly clock: Clock;
  private readonly env: AppEnv;
  private readonly paymentGateway: PaymentGateway;
  private readonly eventBus: EventBus;
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    clock,
    env,
    eventBus,
    paymentGateway,
    session,
  }: {
    em: EntityManager;
    clock: Clock;
    env: AppEnv;
    eventBus: EventBus;
    paymentGateway: PaymentGateway;
    session: Promise<Session | null>;
  }) {
    // Destructure the PROXY cradle synchronously — resolving a key after an await can reach
    // a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.paymentGateway = paymentGateway;
    this.eventBus = eventBus;
    this.session = session;
    void session.catch(() => undefined);
  }

  private async menteeSession(): Promise<Session> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    requireRole(session, 'mentee');
    return session;
  }

  /**
   * Open a hosted payment for a reservation the caller owns (#22).
   *
   * Three refusals, and each is a different thing going wrong, so each says so: the booking
   * belongs to someone else (403), it is not waiting for payment at all (409), or its hold
   * lapsed while the mentee thought about it (409, pointing back at the calendar).
   *
   * **The amount comes from the booking, never from the caller** — `priceCents` was
   * snapshotted from the mentor's own price at reservation (R08) — and the Checkout expires
   * at exactly the booking's own `expiresAt`, so the provider and this database cannot
   * disagree about who owns the slot.
   *
   * The session id is stored **before** the URL is returned. A gateway that answered and a
   * row that did not record it would be a payment nothing could ever match to a booking.
   */
  async startCheckout(bookingId: string): Promise<StartedCheckout> {
    const session = await this.menteeSession();
    const now = this.clock.now();

    const booking = await this.em.findOne(
      Booking,
      { id: bookingId },
      { populate: ['mentee', 'mentorProfile', 'mentorProfile.user'] },
    );
    if (booking === null) throw new NotFoundError('That booking does not exist.');
    assertOwnership(session, booking.mentee.id);

    if (booking.status !== 'pending') throw new ConflictError(NOT_PAYABLE_MESSAGE);
    // A pending row with no expiry is a data anomaly, not an open-ended hold: refuse it the
    // same way as a lapsed one rather than opening a Checkout nothing will ever close.
    const heldUntil = booking.expiresAt ?? null;
    if (heldUntil === null || heldUntil <= now) throw new ConflictError(HOLD_EXPIRED_MESSAGE);

    const { successUrl, cancelUrl } = checkoutReturnUrls(this.env.APP_URL, booking);
    const checkout = await this.paymentGateway.createCheckoutSession({
      bookingId: booking.id,
      amountCents: booking.priceCents,
      currency: booking.currency,
      successUrl,
      cancelUrl,
      expiresAt: heldUntil,
      description:
        `${booking.lengthMinutes}-minute text session with ${booking.mentorProfile.user.displayName}`,
    });

    booking.stripeCheckoutSessionId = checkout.id;
    await this.em.flush();

    return { bookingId: booking.id, checkoutSessionId: checkout.id, url: checkout.url };
  }

  /**
   * Act on one verified provider delivery, exactly once (#22, #34).
   *
   * **The processed-event row is inserted first, inside the same transaction as the
   * confirmation.** Providers redeliver — after a timeout, after a 500, sometimes for no
   * reason — so "confirm exactly once" cannot be a check the handler performs and then
   * hopes nobody repeats. A redelivery loses the insert on the unique index, the whole
   * transaction rolls back having changed nothing, and this answers `duplicate`. One
   * booking, one charge.
   *
   * The event is recorded even for types the product does not act on, so that "we received
   * it and ignored it" stays tellable from "we never received it" when a payment is being
   * reconciled by hand.
   *
   * The event is emitted **after** the transaction commits. A subscriber that sent an email
   * inside it would tell both parties about a booking a rollback then erased.
   */
  async handleWebhookEvent(event: GatewayEvent): Promise<WebhookOutcome> {
    const now = this.clock.now();
    let confirmed: IBooking | null = null;
    let outcome: WebhookOutcome;

    try {
      outcome = await this.em.transactional(async (tx) => {
        tx.persist(tx.create(ProcessedWebhookEvent, {
          eventId: event.id,
          type: event.type === 'unhandled' ? event.rawType : event.type,
          receivedAt: now,
        }));
        await tx.flush();

        if (event.type !== 'checkout.session.completed') return 'ignored';

        const booking = await tx.findOne(
          Booking,
          { stripeCheckoutSessionId: event.checkoutSessionId },
          { populate: ['mentee', 'mentorProfile'] },
        );
        if (booking === null) return 'unknown_booking';
        if (booking.status === 'confirmed') return 'already_confirmed';
        if (booking.status !== 'pending') return 'not_pending';

        // R08. The mentor's price is the only price: an amount that is not it must not be
        // quietly accepted, because the difference has to be reconciled by a person either
        // way and confirming hides that it must be.
        if (event.amountTotalCents !== booking.priceCents) {
          booking.paymentIssue = 'amount_mismatch';
          booking.amountPaidCents = event.amountTotalCents;
          booking.stripePaymentIntentId = event.paymentIntentId;
          await tx.flush();
          return 'amount_mismatch';
        }

        booking.status = 'confirmed';
        // R15/D22: booking-to-start is `startsAt - bookedAt`, both on this row.
        booking.bookedAt = now;
        booking.paidAt = now;
        booking.amountPaidCents = event.amountTotalCents;
        booking.stripePaymentIntentId = event.paymentIntentId;
        booking.paymentIssue = null;
        // The hold is over; the slot is taken by a confirmed booking now.
        booking.expiresAt = null;
        await tx.flush();
        confirmed = booking;
        return 'confirmed';
      });
    } catch (error) {
      if (constraintName(error) === PROCESSED_EVENT_CONSTRAINT) return 'duplicate';
      throw error;
    }

    if (confirmed !== null) {
      const booking: IBooking = confirmed;
      await this.eventBus.emit('bookings.booking.confirmed', {
        bookingId: booking.id,
        menteeId: booking.mentee.id,
        mentorProfileId: booking.mentorProfile.id,
        startsAt: booking.startsAt.toISOString(),
        lengthMinutes: booking.lengthMinutes,
      });
    }

    return outcome;
  }

  /**
   * Release every hold that has lapsed, and report how many (#22).
   *
   * A `pending` booking past its `expiresAt` becomes `expired`, which drops it out of
   * `bookings_active_slot_unique` and makes its slot bookable again. Clearing `expiresAt`
   * is part of that: a terminal row carrying a deadline reads like a hold that is still
   * being honoured.
   *
   * This is the **sweep**, and it is deliberately not the only thing that expires a hold —
   * `BookingService.start` expires the one hold standing in its way, inside its own
   * transaction, so a mentee looking at a free-looking slot can take it without waiting for
   * anyone to run this. There is no scheduler in this project; this exists so an abandoned
   * Checkout does not hold a slot forever when nobody happens to try booking it.
   */
  async expirePending(now: Date): Promise<number> {
    return this.em.transactional(async (tx) => {
      const lapsed = await tx.find(Booking, {
        status: 'pending',
        expiresAt: { $lte: now },
      });
      for (const booking of lapsed) {
        booking.status = 'expired';
        booking.expiresAt = null;
      }
      await tx.flush();
      return lapsed.length;
    });
  }
}

function constraintName(error: unknown): string | null {
  if (!(error instanceof UniqueConstraintViolationException)) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}
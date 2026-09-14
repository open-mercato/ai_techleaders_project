import { Booking, type EntityManager, type IBooking } from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import { assertOwnership, requireRole, type Session } from '../../http/auth';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { PaymentGateway } from './payment-gateway.port';

export const HOLD_EXPIRED_MESSAGE =
  'This reservation has expired. Choose an available time to start a new booking.';
export const NOT_PAYABLE_MESSAGE = 'This booking is not waiting for payment.';

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
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    clock,
    env,
    paymentGateway,
    session,
  }: {
    em: EntityManager;
    clock: Clock;
    env: AppEnv;
    paymentGateway: PaymentGateway;
    session: Promise<Session | null>;
  }) {
    // Destructure the PROXY cradle synchronously — resolving a key after an await can reach
    // a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.paymentGateway = paymentGateway;
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
}

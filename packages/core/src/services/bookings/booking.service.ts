import {
  Booking,
  LockMode,
  Slot,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
  type IBooking,
  type IMentorProfile,
  type ISlot,
} from '@devmentor/db';
import { assertOwnership, requireRole, type Session } from '../../http/auth';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { EventBus } from '../../events/event-bus';
import type { Logger } from '../../logger';
import type { PaymentGateway } from '../payments/payment-gateway.port';
import type { SessionLength } from '../../domain/vocabularies/session-lengths';
import type { BookingCreateInput } from '../../validators/bookings/booking-create.schema';
import {
  PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE,
  type PlatformSettingsService,
} from '../operator/platform-settings.service';
import { mentorOfferReady } from '../mentors/readiness';

const ACTIVE_SLOT_CONSTRAINT = 'bookings_active_slot_unique';

/**
 * How far ahead a session must start (D22, R14).
 *
 * Two hours is the product's promise that a mentor has a chance to prepare — and, read the
 * other way, the only timing statement DevMentor makes at all. No screen may promise how
 * soon an answer arrives.
 */
export const MIN_LEAD_MINUTES = 120;

/**
 * How long a reservation holds its slot before the hold lapses.
 *
 * Thirty minutes, and the Checkout session is created with the same expiry, so the two
 * cannot disagree about who owns the slot. Stripe's own default is 24 hours, which would
 * leave a slot unbookable for a day after someone closed the tab.
 */
export const BOOKING_HOLD_MINUTES = 30;

export const SLOT_TAKEN_MESSAGE = 'This time has just been taken. Choose another one.';
export const LEAD_TIME_MESSAGE =
  'Choose a time that starts at least two hours from now.';
export const MENTOR_NOT_BOOKABLE_MESSAGE =
  'This mentor is not taking bookings at the moment.';

/**
 * How long before a session a mentee may still cancel and be refunded (D10, R09).
 *
 * Inclusive: at exactly 24 hours the cancellation is still free. A boundary that went the
 * other way would refuse a refund to someone who cancelled at the moment the rule names.
 */
export const FREE_CANCELLATION_HOURS = 24;

export const SESSION_STARTED_MESSAGE =
  'This session has already started, so it can no longer be cancelled. '
  + 'Raise a quality dispute with DevMentor instead.';
export const NOT_CANCELLABLE_MESSAGE =
  'Only a paid session can be cancelled. An unpaid reservation releases its time on its own.';

/** One ISO week's paid sessions, for D16. */
export interface PaidSessionWeek {
  /** The Monday the week starts on, as an ISO date. */
  weekStart: string;
  count: number;
}

export interface BookingMetrics {
  weeks: PaidSessionWeek[];
  /**
   * D22's median booking-to-start, in whole minutes, or `null` when nothing has been booked
   * in the window. **Null, never zero** — "no data" and "booked at the last moment" are
   * different answers and only one of them is a problem.
   */
  medianBookingToStartMinutes: number | null;
}

export interface CancelledBookingDto {
  id: string;
  status: string;
  refundStatus: string;
  /** What the mentee is owed back, in minor units. `0` when the fee is forfeit. */
  refundedAmountCents: number;
}

export interface BookingDto {
  id: string;
  slotId: string;
  mentorSlug: string;
  mentorName: string;
  lengthMinutes: number;
  priceCents: number;
  currency: string;
  status: string;
  startsAt: string;
  expiresAt: string | null;
}

/**
 * One session in a caller's own list (#23).
 *
 * `counterpartName` rather than a mentor field and a mentee field: the two lists are the
 * same screen from opposite sides, and naming the *other* person is what both of them
 * actually show.
 *
 * `isPast` is computed against the **server's** clock. A browser's clock is a setting, and
 * a session that has started is exactly what decides whether cancelling is still allowed
 * (E03-S05), so the answer cannot come from the caller.
 */
export interface SessionListItemDto {
  id: string;
  counterpartName: string;
  lengthMinutes: number;
  priceCents: number;
  currency: string;
  status: string;
  /** Where a cancelled session's money got to (R09). `none` on everything else. */
  refundStatus: string;
  startsAt: string;
  isPast: boolean;
  /** Whether this session can be cancelled at all — paid for, and not yet started. */
  cancellable: boolean;
  /**
   * Whether cancelling it **right now** would refund the fee (D10).
   *
   * Computed here rather than in the browser, because R09 requires the confirmation screen
   * to state the outcome *before* the mentee confirms, and a browser clock is a setting. It
   * is a snapshot from when the list was read; the server decides again at cancellation and
   * the response says what actually happened.
   */
  refundOnCancel: boolean;
}

export function toBookingDto(booking: IBooking): BookingDto {
  return {
    id: booking.id,
    slotId: booking.slot.id,
    mentorSlug: booking.mentorProfile.slug as string,
    mentorName: booking.mentorProfile.user.displayName,
    lengthMinutes: booking.lengthMinutes,
    priceCents: booking.priceCents,
    currency: booking.currency,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    expiresAt: booking.expiresAt?.toISOString() ?? null,
  };
}

/** The Monday of the ISO week an instant falls in, at midnight UTC. */
export function weekStartOf(instant: Date): Date {
  const monday = new Date(Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  ));
  // `getUTCDay()` is 0 on Sunday, which belongs to the week that started six days earlier.
  const offset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday;
}

/**
 * The middle value, averaging the two middles on an even count.
 *
 * A mean would be pulled by one mentee who booked three months ahead; D22 asks for a
 * median precisely because the distribution has a long tail.
 */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function toSessionListItem(booking: IBooking, counterpartName: string, now: Date): SessionListItemDto {
  const isPast = booking.startsAt.getTime() <= now.getTime();
  const cancellable = booking.status === 'confirmed' && !isPast;
  return {
    id: booking.id,
    counterpartName,
    lengthMinutes: booking.lengthMinutes,
    priceCents: booking.priceCents,
    currency: booking.currency,
    status: booking.status,
    refundStatus: booking.refundStatus,
    startsAt: booking.startsAt.toISOString(),
    isPast,
    cancellable,
    refundOnCancel:
      cancellable
      && booking.startsAt.getTime() - now.getTime() >= FREE_CANCELLATION_HOURS * 60 * 60 * 1000,
  };
}

function constraintName(error: unknown): string | null {
  if (!(error instanceof UniqueConstraintViolationException)) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

/** The mentor's own price for the length asked for, in minor units. */
function storedPriceCents(profile: IMentorProfile, length: SessionLength): number | null {
  return (length === '25' ? profile.price25Cents : profile.price50Cents) ?? null;
}

export class BookingService {
  private readonly em: EntityManager;
  private readonly clock: Clock;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly paymentGateway: PaymentGateway;
  private readonly session: Promise<Session | null>;
  private readonly platformSettingsService?: Pick<PlatformSettingsService, 'get'>;

  constructor({
    em,
    clock,
    eventBus,
    logger,
    paymentGateway,
    session,
    platformSettingsService,
  }: {
    em: EntityManager;
    clock: Clock;
    eventBus: EventBus;
    logger: Logger;
    paymentGateway: PaymentGateway;
    session: Promise<Session | null>;
    platformSettingsService?: Pick<PlatformSettingsService, 'get'>;
  }) {
    // Destructure the PROXY cradle synchronously: retaining it and resolving a key after
    // an await can reach a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.eventBus = eventBus;
    this.logger = logger;
    this.paymentGateway = paymentGateway;
    this.session = session;
    this.platformSettingsService = platformSettingsService;
    void session.catch(() => undefined);
  }

  private async menteeSession(): Promise<Session> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    requireRole(session, 'mentee');
    return session;
  }

  private async mentorSession(): Promise<Session> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    requireRole(session, 'mentor');
    return session;
  }

  private currency(): string {
    if (this.platformSettingsService === undefined) {
      throw new ServiceUnavailableError(PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE);
    }
    return this.platformSettingsService.get().currency;
  }

  /**
   * Reserve a slot for the signed-in mentee (#21).
   *
   * The whole check-then-write runs inside one transaction with the slot row locked, so the
   * lead-time rule, the mentor's bookability and the "is this slot free" question are all
   * answered against a state nobody else can change underneath. The database still has the
   * last word: `bookings_active_slot_unique` turns a lost race into a `23505`, which is
   * translated to the same 409 the in-transaction check produces, so a caller cannot tell
   * which path refused them and does not need to.
   *
   * A `pending` booking whose hold has lapsed is marked `expired` here rather than waiting
   * for the sweep, because a mentee looking at a free-looking slot must be able to take it
   * immediately.
   */
  async start(input: BookingCreateInput): Promise<BookingDto> {
    const session = await this.menteeSession();
    const now = this.clock.now();
    const currency = this.currency();
    const length = String(input.lengthMinutes) as SessionLength;

    try {
      const booking = await this.em.transactional(async (tx) => {
        const slot = await tx.findOne(
          Slot,
          { id: input.slotId, removedAt: null },
          {
            populate: ['mentorProfile', 'mentorProfile.user'],
            lockMode: LockMode.PESSIMISTIC_WRITE,
          },
        );
        if (slot === null) throw new NotFoundError('That time is no longer available.');

        this.assertLeadTime(slot, now);
        const priceCents = this.assertBookable(slot.mentorProfile, length);
        await this.releaseLapsedHold(tx, slot, now);

        const created = tx.create(Booking, {
          slot,
          mentee: tx.getReference(User, session.userId),
          mentorProfile: slot.mentorProfile,
          lengthMinutes: input.lengthMinutes,
          priceCents,
          currency,
          status: 'pending',
          startsAt: slot.startsAt,
          bookedAt: null,
          expiresAt: new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60_000),
        });
        tx.persist(created);
        await tx.flush();
        return created;
      });

      return toBookingDto(booking);
    } catch (error) {
      if (constraintName(error) === ACTIVE_SLOT_CONSTRAINT) {
        throw new ConflictError(SLOT_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  private assertLeadTime(slot: ISlot, now: Date): void {
    const leadMs = slot.startsAt.getTime() - now.getTime();
    if (leadMs < MIN_LEAD_MINUTES * 60_000) {
      throw new ValidationError(LEAD_TIME_MESSAGE, { slotId: [LEAD_TIME_MESSAGE] });
    }
  }

  /** Published, with a price for the length asked for. Returns that price. */
  private assertBookable(profile: IMentorProfile, length: SessionLength): number {
    const readiness = mentorOfferReady.evaluate({
      publishedAt: profile.publishedAt ?? null,
      price25Cents: profile.price25Cents ?? null,
      price50Cents: profile.price50Cents ?? null,
    });
    const priceCents = storedPriceCents(profile, length);
    if (!readiness.ready || priceCents === null) {
      throw new ConflictError(MENTOR_NOT_BOOKABLE_MESSAGE);
    }
    return priceCents;
  }

  /**
   * Expire the slot's own lapsed hold, inside the caller's transaction.
   *
   * Scoped to this slot rather than sweeping globally: this runs on the booking path, where
   * the only hold that matters is the one standing in the way. `expirePending` (E03-S03)
   * owns the sweep.
   */
  private async releaseLapsedHold(tx: EntityManager, slot: ISlot, now: Date): Promise<void> {
    const held = await tx.findOne(Booking, {
      slot: slot.id,
      status: { $in: ['pending', 'confirmed'] },
    });
    if (held === null) return;
    // Fail closed. A confirmed booking is never released here, and a pending row with no
    // expiry is a data anomaly rather than a lapsed hold — taking its slot would sell a
    // time someone may already be paying for.
    const heldUntil = held.expiresAt ?? null;
    if (held.status === 'confirmed' || heldUntil === null || heldUntil > now) {
      throw new ConflictError(SLOT_TAKEN_MESSAGE);
    }
    held.status = 'expired';
    held.expiresAt = null;
    await tx.flush();
  }

  /**
   * The signed-in mentee's own sessions, soonest first (#23).
   *
   * The caller is the session, never a parameter: there is no user id in the request for
   * anyone to tamper with. A `pending` reservation is included on purpose — a mentee who
   * abandoned a checkout should be able to see the hold rather than wonder where their
   * money went.
   */
  async listForMentee(): Promise<SessionListItemDto[]> {
    const session = await this.menteeSession();
    const now = this.clock.now();
    const bookings = await this.em.find(
      Booking,
      { mentee: session.userId },
      { populate: ['mentorProfile', 'mentorProfile.user'], orderBy: { startsAt: 'asc' } },
    );
    return bookings.map((booking) =>
      toSessionListItem(booking, booking.mentorProfile.user.displayName, now),
    );
  }

  /**
   * The signed-in mentor's own sessions, soonest first (#23).
   *
   * Scoped through `mentorProfile.user`, so a mentor sees the bookings made with *them* and
   * nothing else. **Only confirmed and cancelled bookings appear**: a mentee's abandoned
   * hold on a slot is not a session anyone booked with this mentor, and showing it would
   * put a stranger's half-finished purchase on a mentor's screen.
   */
  async listForMentor(): Promise<SessionListItemDto[]> {
    const session = await this.mentorSession();
    const now = this.clock.now();
    const bookings = await this.em.find(
      Booking,
      {
        mentorProfile: { user: session.userId },
        status: { $in: ['confirmed', 'cancelled'] },
      },
      { populate: ['mentee'], orderBy: { startsAt: 'asc' } },
    );
    return bookings.map((booking) => toSessionListItem(booking, booking.mentee.displayName, now));
  }

  /**
   * What the founders check D16 and D22 against, for operators only.
   *
   * **Counted by `bookedAt`, and that choice is open.** #22 records that whether a paid
   * session falls in the week it was booked or the week it happens is undecided; booking
   * week is the one this reads, and switching it is one line here rather than a rewrite.
   *
   * A session is "paid" when it is `confirmed` — a cancelled one was paid and then refunded
   * or forfeited, which is a different question and not this metric.
   *
   * The window is `days` back from the server's own clock. The caller names a length, never
   * an instant: a metric an operator could move by sending a different date is not a metric.
   */
  async metricsForLastDays(days: number): Promise<BookingMetrics> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    requireRole(session, 'operator');

    // The window is measured from the **server's** clock, not from an instant a caller
    // passed in: a page computing one would be reading a clock during render, and a metric
    // an operator can move by sending a different date is not a metric.
    const since = new Date(this.clock.now().getTime() - days * 24 * 60 * 60 * 1000);
    const paid = await this.em.find(
      Booking,
      { status: 'confirmed', bookedAt: { $gte: since } },
      { orderBy: { bookedAt: 'asc' } },
    );

    const byWeek = new Map<string, number>();
    const leadMinutes: number[] = [];
    for (const booking of paid) {
      const bookedAt = booking.bookedAt;
      if (bookedAt == null) continue;
      const week = weekStartOf(bookedAt).toISOString().slice(0, 10);
      byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
      leadMinutes.push(
        Math.round((booking.startsAt.getTime() - bookedAt.getTime()) / 60_000),
      );
    }

    return {
      weeks: [...byWeek].map(([weekStart, count]) => ({ weekStart, count })),
      medianBookingToStartMinutes: medianOf(leadMinutes),
    };
  }

  /**
   * Cancel a paid session the signed-in mentee owns (#24, D10, R09).
   *
   * Three decisions, in the order they matter:
   *
   * 1. **A session that has started cannot be cancelled.** It is refused with a pointer at
   *    the quality-dispute path (E05-S03), because the mentee still has a way to be heard —
   *    a bare refusal would read as "your money is gone, goodbye".
   * 2. **The slot is freed either way.** Cancelling inside the window still releases the
   *    time: the mentor should be able to sell it again, and the forfeited fee is a separate
   *    question from whether anybody can book that hour.
   * 3. **The refund follows the 24-hour rule and nothing else.** More than 24 hours out, the
   *    full amount comes back; inside it, nothing does, and `refundStatus` stays `none`
   *    because that is a decision the product made rather than a refund that failed.
   *
   * The cancellation commits **before** the refund is attempted, and the event is emitted
   * from the committed state. A refund that fails therefore leaves a cancelled booking with
   * `refundStatus: 'failed'` — money owed and not yet returned, which is exactly the state
   * an operator needs to see — rather than rolling back a cancellation the mentee already
   * made and the mentor was already told about.
   */
  async cancelByMentee(bookingId: string): Promise<CancelledBookingDto> {
    const session = await this.menteeSession();
    const now = this.clock.now();

    const booking = await this.em.findOne(
      Booking,
      { id: bookingId },
      { populate: ['mentee', 'mentorProfile'] },
    );
    if (booking === null) throw new NotFoundError('That booking does not exist.');
    assertOwnership(session, booking.mentee.id);

    if (booking.status !== 'confirmed') throw new ConflictError(NOT_CANCELLABLE_MESSAGE);
    if (booking.startsAt.getTime() <= now.getTime()) {
      throw new ConflictError(SESSION_STARTED_MESSAGE);
    }

    const freeWindowMs = FREE_CANCELLATION_HOURS * 60 * 60 * 1000;
    // Inclusive: at exactly 24 hours the cancellation is still free.
    const refundOwed = booking.startsAt.getTime() - now.getTime() >= freeWindowMs;

    await this.em.transactional(async (tx) => {
      const held = await tx.findOne(Booking, { id: booking.id });
      if (held === null) throw new NotFoundError('That booking does not exist.');
      held.status = 'cancelled';
      held.cancelledAt = now;
      held.refundStatus = refundOwed ? 'pending' : 'none';
      await tx.flush();
    });

    await this.eventBus.emit('bookings.booking.cancelled', {
      bookingId: booking.id,
      menteeId: booking.mentee.id,
      mentorProfileId: booking.mentorProfile.id,
      startsAt: booking.startsAt.toISOString(),
      refunded: refundOwed,
    });

    if (!refundOwed) {
      return {
        id: booking.id,
        status: 'cancelled',
        refundStatus: 'none',
        refundedAmountCents: 0,
      };
    }
    return this.refund(booking.id, booking.stripePaymentIntentId ?? null, booking.priceCents);
  }

  /**
   * Return the money, and record where it got to.
   *
   * The booking id is the idempotency key, so a retried cancellation is the same refund
   * rather than a second one. A failure is recorded, not thrown: the session is already
   * cancelled and the mentee already knows, so the useful outcome is a row an operator can
   * find, not a 500 that hides it.
   */
  private async refund(
    bookingId: string,
    paymentIntentId: string | null,
    priceCents: number,
  ): Promise<CancelledBookingDto> {
    let outcome: { refundStatus: string; refundId: string | null; amount: number };
    try {
      if (paymentIntentId === null) {
        // A confirmed booking with no payment reference cannot be refunded automatically.
        throw new Error('the booking carries no payment reference');
      }
      const refund = await this.paymentGateway.refund({
        paymentIntentId,
        amountCents: priceCents,
        idempotencyKey: bookingId,
      });
      outcome = refund.status === 'succeeded'
        ? { refundStatus: 'refunded', refundId: refund.id, amount: priceCents }
        : { refundStatus: refund.status === 'failed' ? 'failed' : 'pending', refundId: refund.id, amount: 0 };
    } catch (error) {
      this.logger.error({ err: error, bookingId }, 'refund could not be completed');
      outcome = { refundStatus: 'failed', refundId: null, amount: 0 };
    }

    await this.em.transactional(async (tx) => {
      const held = await tx.findOne(Booking, { id: bookingId });
      if (held === null) return;
      held.refundStatus = outcome.refundStatus as typeof held.refundStatus;
      held.stripeRefundId = outcome.refundId;
      held.refundedAmountCents = outcome.amount;
      await tx.flush();
    });

    return {
      id: bookingId,
      status: 'cancelled',
      refundStatus: outcome.refundStatus,
      refundedAmountCents: outcome.amount,
    };
  }
}

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
import { requireRole, type Session } from '../../http/auth';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../http/errors';
import type { Clock } from '../../time/clock';
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
  private readonly session: Promise<Session | null>;
  private readonly platformSettingsService?: Pick<PlatformSettingsService, 'get'>;

  constructor({
    em,
    clock,
    session,
    platformSettingsService,
  }: {
    em: EntityManager;
    clock: Clock;
    session: Promise<Session | null>;
    platformSettingsService?: Pick<PlatformSettingsService, 'get'>;
  }) {
    // Destructure the PROXY cradle synchronously: retaining it and resolving a key after
    // an await can reach a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
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
}

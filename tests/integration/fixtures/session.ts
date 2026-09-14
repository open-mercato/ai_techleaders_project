import {
  Booking,
  MentorProfile,
  MikroORM,
  SessionMessage,
  Slot,
  User,
  entities,
} from '@devmentor/db';

/**
 * Confirmed bookings whose text session is open, and whose text session is over (#26).
 *
 * **The product cannot produce either of these**: a booking must start at least two hours
 * ahead (`MIN_LEAD_MINUTES`), so no booking made through `POST /api/bookings` is ever inside
 * its own window. Every scenario about an open or an ended session therefore has to plant the
 * row, and this is the one place that happens.
 *
 * The rows are written with the two seeded personas a mock sign-in can reach, so a scenario
 * can hold the same session from both sides.
 */
export interface TextSessionFixture {
  /** The session whose window is open right now. */
  openBookingId: string;
  /** The session whose window closed an hour ago. */
  endedBookingId: string;
  /** The mentee's first message in the open session, already stored. */
  firstMessage: string;
  menteeName: string;
  mentorName: string;
}

const MINUTE = 60_000;
export const FIXTURE_FIRST_MESSAGE = 'Where should I validate an API request before saving it?';

/** The fixture key, so cleanup removes exactly these rows and nothing a scenario made. */
const KEYS = {
  open: 'integration-text-session-open',
  ended: 'integration-text-session-ended',
} as const;

export async function seedTextSessions(databaseUrl: string): Promise<TextSessionFixture> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const mentee = await em.findOneOrFail(User, { email: 'mock-mentee@devmentor.test' });
    const mentorUser = await em.findOneOrFail(User, { email: 'mock-mentor@devmentor.test' });
    const mentorProfile = await em.findOneOrFail(MentorProfile, { user: mentorUser.id });
    const now = Date.now();

    // Started 10 minutes ago and 50 minutes long: open, and far enough inside its window that
    // a slow run cannot drift out of it.
    const openStartsAt = new Date(now - 10 * MINUTE);
    const openSlot = em.create(Slot, {
      mentorProfile,
      startsAt: openStartsAt,
      removedAt: null,
    });
    const open = em.create(Booking, {
      slot: openSlot,
      mentee,
      mentorProfile,
      lengthMinutes: 50,
      priceCents: 18_000,
      currency: 'PLN',
      status: 'confirmed',
      startsAt: openStartsAt,
      bookedAt: new Date(now),
      stripeCheckoutSessionId: KEYS.open,
      paidAt: new Date(now),
      amountPaidCents: 18_000,
      expiresAt: null,
    });
    em.create(SessionMessage, {
      booking: open,
      author: mentee,
      body: FIXTURE_FIRST_MESSAGE,
      createdAt: new Date(openStartsAt.getTime() + MINUTE),
    });

    const endedStartsAt = new Date(now - 90 * MINUTE);
    const endedSlot = em.create(Slot, {
      mentorProfile,
      startsAt: endedStartsAt,
      removedAt: null,
    });
    const ended = em.create(Booking, {
      slot: endedSlot,
      mentee,
      mentorProfile,
      lengthMinutes: 25,
      priceCents: 9_000,
      currency: 'PLN',
      status: 'confirmed',
      startsAt: endedStartsAt,
      bookedAt: new Date(now),
      stripeCheckoutSessionId: KEYS.ended,
      paidAt: new Date(now),
      amountPaidCents: 9_000,
      expiresAt: null,
    });

    await em.flush();
    return {
      openBookingId: open.id,
      endedBookingId: ended.id,
      firstMessage: FIXTURE_FIRST_MESSAGE,
      menteeName: mentee.displayName,
      mentorName: mentorUser.displayName,
    };
  } finally {
    await orm.close(true);
  }
}

/**
 * Remove the two fixture bookings, their messages and their slots.
 *
 * Ordered: `session_messages` cascade from the booking, but a booking `restrict`s its slot, so
 * the slot has to go last or the delete is refused and the next run collides with the
 * active-slot unique index.
 */
export async function resetTextSessions(databaseUrl: string): Promise<void> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const bookings = await em.find(Booking, {
      stripeCheckoutSessionId: { $in: [KEYS.open, KEYS.ended] },
    });
    for (const booking of bookings) {
      const slotId = booking.slot.id;
      await em.nativeDelete(SessionMessage, { booking: booking.id });
      await em.nativeDelete(Booking, { id: booking.id });
      await em.nativeDelete(Slot, { id: slotId });
    }
  } finally {
    await orm.close(true);
  }
}

import type { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Booking } from '../entities/bookings/booking.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';
import { SessionMessage } from '../entities/sessions/session-message.entity';
import { Slot } from '../entities/availability/slot.entity';
import { User } from '../entities/auth/user.entity';
import { SEED_MENTEE_EMAIL, SEED_MOCK_MENTOR_EMAIL } from './database.seeder';

/**
 * Why this seeder exists at all.
 *
 * A booking must start at least two hours ahead (`MIN_LEAD_MINUTES`), so **a session booked
 * by hand can never be open now**. Manual QA of #26 therefore cannot reach the open state —
 * or the ended one — through the product's own flow at any point today. Without these
 * fixtures, two of the three window states are unverifiable by a human.
 */

/**
 * The fixture key, and the reason it is this column.
 *
 * `bookings.stripe_checkout_session_id` is unique and nullable, so a value no payment
 * provider would ever issue identifies a row this seeder created and nothing else. That is
 * what makes re-running safe: the seeder deletes and recreates **only** rows carrying these
 * three keys, so it cannot touch a booking somebody made by hand on the same database.
 */
const FIXTURE_KEYS = {
  notStarted: 'qa-fixture-session-not-started',
  open: 'qa-fixture-session-open',
  ended: 'qa-fixture-session-ended',
} as const;

const MINUTE = 60_000;

interface Fixture {
  key: string;
  /** Minutes from now to the start. Negative means the session has already started. */
  startsInMinutes: number;
  lengthMinutes: 25 | 50;
  priceCents: number;
  /** Seeded exchange, `author: 'mentee' | 'mentor'`, oldest first. */
  messages: readonly { author: 'mentee' | 'mentor'; body: string }[];
}

/**
 * One fixture per window state, with the open one deliberately started 10 minutes ago rather
 * than exactly now: a session that starts at the instant of seeding is one clock-skew away
 * from still being `not_started` when the browser arrives.
 */
const FIXTURES: readonly Fixture[] = [
  { key: FIXTURE_KEYS.notStarted, startsInMinutes: 30, lengthMinutes: 25, priceCents: 12_000, messages: [] },
  {
    key: FIXTURE_KEYS.open,
    startsInMinutes: -10,
    lengthMinutes: 50,
    priceCents: 22_000,
    messages: [
      { author: 'mentee', body: 'My API result has optional data and error fields, and every caller checks both. Where should I start?' },
      { author: 'mentor', body: 'Make success and failure separate cases first. Can you paste the current type?' },
    ],
  },
  {
    key: FIXTURE_KEYS.ended,
    startsInMinutes: -120,
    lengthMinutes: 25,
    priceCents: 12_000,
    messages: [
      { author: 'mentee', body: 'Thanks — that settles where validation goes.' },
      { author: 'mentor', body: 'I will write the rest up as the answer.' },
    ],
  },
];

export const QA_SESSION_SEEDER_PREREQUISITE =
  'Run `npm run db:seed` first: this fixture needs the seeded mock mentee and mock mentor.';

/**
 * Confirmed bookings for manual QA of the text session (#26) — one before its start, one open
 * now, one already ended — between the two personas a mock sign-in can reach.
 *
 * **Never part of `npm run db:seed`.** Run it explicitly with `npm run db:seed:sessions`. The
 * default seed's empty sessions list is a state E03's screens and its integration tests
 * assert on, and quietly planting three bookings into every fresh database would change what
 * "a fresh install" means for every one of them.
 */
export class QaSessionSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const mentee = await em.findOne(User, { email: SEED_MENTEE_EMAIL });
    const mentorUser = await em.findOne(User, { email: SEED_MOCK_MENTOR_EMAIL });
    const mentorProfile = mentorUser === null
      ? null
      : await em.findOne(MentorProfile, { user: mentorUser.id });
    if (mentee === null || mentorUser === null || mentorProfile === null) {
      throw new Error(QA_SESSION_SEEDER_PREREQUISITE);
    }

    const now = Date.now();

    for (const fixture of FIXTURES) {
      // Delete before create, by fixture key only. `session_messages` cascades from the
      // booking in the database, but the slot does not: a booking `restrict`s its slot, so
      // the slot has to go after it and explicitly, or the next run would leave one behind
      // and eventually collide with the active-slot unique index.
      const previous = await em.findOne(Booking, { stripeCheckoutSessionId: fixture.key });
      if (previous !== null) {
        const slotId = previous.slot.id;
        await em.nativeDelete(SessionMessage, { booking: previous.id });
        await em.nativeDelete(Booking, { id: previous.id });
        await em.nativeDelete(Slot, { id: slotId });
      }

      const startsAt = new Date(now + fixture.startsInMinutes * MINUTE);
      const slot = em.create(Slot, { mentorProfile, startsAt, removedAt: null });
      const booking = em.create(Booking, {
        slot,
        mentee,
        mentorProfile,
        lengthMinutes: fixture.lengthMinutes,
        priceCents: fixture.priceCents,
        currency: 'PLN',
        status: 'confirmed',
        startsAt,
        // A confirmed booking carries the payment facts it was confirmed by, so the fixture
        // looks like one the webhook produced rather than a row with a status typed onto it.
        bookedAt: new Date(now),
        stripeCheckoutSessionId: fixture.key,
        paidAt: new Date(now),
        amountPaidCents: fixture.priceCents,
        expiresAt: null,
      });

      fixture.messages.forEach((message, index) => {
        em.create(SessionMessage, {
          booking,
          author: message.author === 'mentee' ? mentee : mentorUser,
          body: message.body,
          // Spread through the first minutes of the session so the transcript has an order
          // that does not depend on insertion timing.
          createdAt: new Date(startsAt.getTime() + (index + 1) * MINUTE),
        });
      });
    }
  }
}

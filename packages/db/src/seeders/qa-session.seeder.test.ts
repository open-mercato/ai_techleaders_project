import type { EntityManager } from '@mikro-orm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Booking } from '../entities/bookings/booking.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';
import { SessionMessage } from '../entities/sessions/session-message.entity';
import { Slot } from '../entities/availability/slot.entity';
import { User } from '../entities/auth/user.entity';
import { SEED_MENTEE_EMAIL, SEED_MOCK_MENTOR_EMAIL } from './database.seeder';
import { QA_SESSION_SEEDER_PREREQUISITE, QaSessionSeeder } from './qa-session.seeder';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const MENTEE = { id: 'mentee-id', email: SEED_MENTEE_EMAIL } as never;
const MENTOR_USER = { id: 'mentor-user-id', email: SEED_MOCK_MENTOR_EMAIL } as never;
const PROFILE = { id: 'profile-id', user: MENTOR_USER } as never;

interface Created {
  entity: unknown;
  data: Record<string, unknown>;
}

function makeEm({
  mentee = MENTEE,
  mentorUser = MENTOR_USER,
  profile = PROFILE,
  existing = null,
}: {
  mentee?: unknown;
  mentorUser?: unknown;
  profile?: unknown;
  /** A previously seeded booking keyed by the fixture, or `null` for a first run. */
  existing?: { id: string; slot: { id: string } } | null;
} = {}) {
  const created: Created[] = [];
  const deleted: { entity: unknown; where: Record<string, unknown> }[] = [];
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === User) return where.email === SEED_MENTEE_EMAIL ? mentee : mentorUser;
      if (entity === MentorProfile) return profile;
      return existing;
    }),
    nativeDelete: vi.fn(async (entity: unknown, where: Record<string, unknown>) => {
      deleted.push({ entity, where });
      return 1;
    }),
    create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
      created.push({ entity, data });
      return { id: `created-${created.length}`, ...data };
    }),
  };
  return { em: em as unknown as EntityManager, created, deleted };
}

function createdOf(created: Created[], entity: unknown): Record<string, unknown>[] {
  return created.filter((item) => item.entity === entity).map((item) => item.data);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('QaSessionSeeder', () => {
  it('plants one confirmed booking per window state, keyed so a re-run can find them', async () => {
    const harness = makeEm();

    await new QaSessionSeeder().run(harness.em);

    const bookings = createdOf(harness.created, Booking);
    expect(bookings.map((booking) => booking.stripeCheckoutSessionId)).toEqual([
      'qa-fixture-session-not-started',
      'qa-fixture-session-open',
      'qa-fixture-session-ended',
    ]);
    expect(bookings.every((booking) => booking.status === 'confirmed')).toBe(true);
    // A confirmed booking carries what confirmed it, so the fixture is not a status typed on.
    expect(bookings.every((booking) => booking.paidAt !== null && booking.bookedAt !== null)).toBe(true);
    expect(bookings.every((booking) => booking.amountPaidCents === booking.priceCents)).toBe(true);
    expect(bookings.every((booking) => booking.expiresAt === null)).toBe(true);
  });

  it('places the three starts so each window state is actually reachable now', async () => {
    const harness = makeEm();

    await new QaSessionSeeder().run(harness.em);

    const [notStarted, open, ended] = createdOf(harness.created, Booking) as {
      startsAt: Date;
      lengthMinutes: number;
    }[];
    const minutesFromNow = (at: Date): number => (at.getTime() - NOW.getTime()) / 60_000;

    expect(minutesFromNow(notStarted!.startsAt)).toBe(30);
    // Started 10 minutes ago and 50 minutes long: open now, and not one clock-skew away
    // from still counting as not started.
    expect(minutesFromNow(open!.startsAt)).toBe(-10);
    expect(open!.lengthMinutes).toBe(50);
    expect(minutesFromNow(ended!.startsAt) + ended!.lengthMinutes).toBeLessThan(0);
  });

  it('gives each booking its own slot at the same instant', async () => {
    const harness = makeEm();

    await new QaSessionSeeder().run(harness.em);

    const slots = createdOf(harness.created, Slot);
    const bookings = createdOf(harness.created, Booking);
    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => slot.startsAt)).toEqual(bookings.map((booking) => booking.startsAt));
    expect(slots.every((slot) => slot.removedAt === null)).toBe(true);
  });

  it('seeds an exchange in the open and ended sessions, attributed to both sides', async () => {
    const harness = makeEm();

    await new QaSessionSeeder().run(harness.em);

    const messages = createdOf(harness.created, SessionMessage);
    expect(messages).toHaveLength(4);
    expect(messages.map((message) => (message.author as { id: string }).id)).toEqual([
      'mentee-id',
      'mentor-user-id',
      'mentee-id',
      'mentor-user-id',
    ]);
    // Ordered by an explicit createdAt rather than by insertion timing.
    const first = messages[0] as { createdAt: Date };
    const second = messages[1] as { createdAt: Date };
    expect(second.createdAt.getTime() - first.createdAt.getTime()).toBe(60_000);
  });

  it('deletes the rows it planted before planting them again, and nothing else', async () => {
    const harness = makeEm({ existing: { id: 'old-booking', slot: { id: 'old-slot' } } });

    await new QaSessionSeeder().run(harness.em);

    // Messages, then the booking, then the slot: a booking restricts its slot, so the slot
    // cannot go first, and leaving it behind would eventually hit the active-slot index.
    expect(harness.deleted.map((call) => call.entity)).toEqual([
      SessionMessage, Booking, Slot,
      SessionMessage, Booking, Slot,
      SessionMessage, Booking, Slot,
    ]);
    expect(harness.deleted.slice(0, 3).map((call) => call.where)).toEqual([
      { booking: 'old-booking' },
      { id: 'old-booking' },
      { id: 'old-slot' },
    ]);
  });

  it('deletes nothing on a first run', async () => {
    const harness = makeEm();

    await new QaSessionSeeder().run(harness.em);

    expect(harness.deleted).toEqual([]);
  });

  it.each([
    { missing: 'the mentee', em: () => makeEm({ mentee: null }) },
    { missing: 'the mock mentor', em: () => makeEm({ mentorUser: null }) },
    { missing: "the mentor's profile", em: () => makeEm({ profile: null }) },
  ])('refuses to guess when $missing is not seeded', async ({ em }) => {
    const harness = em();

    await expect(new QaSessionSeeder().run(harness.em)).rejects.toThrow(
      QA_SESSION_SEEDER_PREREQUISITE,
    );
    expect(harness.created).toHaveLength(0);
  });
});

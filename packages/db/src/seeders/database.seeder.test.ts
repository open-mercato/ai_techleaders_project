import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';
import {
  DatabaseSeeder,
  SEED_MENTEE_EMAIL,
  SEED_MENTOR_EMAIL,
  SEED_OPERATOR_EMAIL,
} from './database.seeder';

type FakeEntityManager = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

/**
 * `existingByEmail` stands in for the rows already in the database; every other lookup
 * resolves to `null`. `create` echoes its data back so the `MentorProfile` assertion can
 * check it received the very object the `User` creation returned.
 */
function fakeEntityManager(existingByEmail: Record<string, unknown> = {}): FakeEntityManager {
  return {
    findOne: vi.fn((_entity: unknown, where: { email: string }) =>
      Promise.resolve(existingByEmail[where.email] ?? null),
    ),
    create: vi.fn((_entity: unknown, data: unknown) => data),
  };
}

describe('DatabaseSeeder', () => {
  it('creates one verified user per role on an empty database', async () => {
    const em = fakeEntityManager();

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    expect(em.findOne).toHaveBeenNthCalledWith(1, User, { email: SEED_MENTOR_EMAIL });
    expect(em.findOne).toHaveBeenNthCalledWith(2, User, { email: SEED_MENTEE_EMAIL });
    expect(em.findOne).toHaveBeenNthCalledWith(3, User, { email: SEED_OPERATOR_EMAIL });

    const created = em.create.mock.calls
      .filter(([entity]) => entity === User)
      .map(([, data]) => data as Record<string, unknown>);

    expect(created).toEqual([
      {
        email: SEED_MENTOR_EMAIL,
        displayName: 'Ada Lovelace',
        roles: ['mentor'],
        githubLogin: 'ada',
        emailVerifiedAt: expect.any(Date),
      },
      {
        email: SEED_MENTEE_EMAIL,
        displayName: 'Mock Mentee',
        roles: ['mentee'],
        githubLogin: 'mock-mentee',
        emailVerifiedAt: expect.any(Date),
      },
      {
        // The operator holds `mentor` too: the two are independent assignments, and a
        // regression that lets one erase the other has to fail somewhere.
        email: SEED_OPERATOR_EMAIL,
        displayName: 'Mock Operator',
        roles: ['operator', 'mentor'],
        githubLogin: 'mock-operator',
        emailVerifiedAt: expect.any(Date),
      },
    ]);
  });

  it('gives only the mentor a profile, linked to the user object it just created', async () => {
    const em = fakeEntityManager();

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    const profiles = em.create.mock.calls.filter(([entity]) => entity === MentorProfile);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.[1]).toEqual({
      user: expect.objectContaining({ email: SEED_MENTOR_EMAIL }),
      headline: 'Systems & algorithms mentor',
      bio: 'Helping engineers reason about complexity.',
      yearsOfExperience: 12,
    });
  });

  it('is idempotent: seeding an already-seeded database inserts nothing', async () => {
    // Regression guard for the unique violation on `users.email` that made a second
    // `npm run db:seed` — and therefore a second `npm run setup` — fail outright.
    const rows = {
      [SEED_MENTOR_EMAIL]: {
        email: SEED_MENTOR_EMAIL,
        displayName: 'Ada Lovelace',
        roles: ['mentor'],
        githubLogin: 'ada',
        emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
      },
      [SEED_MENTEE_EMAIL]: { email: SEED_MENTEE_EMAIL, emailVerifiedAt: new Date() },
      [SEED_OPERATOR_EMAIL]: { email: SEED_OPERATOR_EMAIL, emailVerifiedAt: new Date() },
    };
    const em = fakeEntityManager(rows);

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    expect(em.create).not.toHaveBeenCalled();
    // An already-verified row keeps its original timestamp — re-seeding must not look
    // like a fresh verification.
    expect(rows[SEED_MENTOR_EMAIL].emailVerifiedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('reconciles a row that predates the auth-identity columns', async () => {
    // A database migrated rather than created from scratch has Ada at the column default
    // `{mentee}` with no verification timestamp, and only the seeder knows she is the
    // mentor. Her email is never rewritten.
    const ada: Record<string, unknown> = {
      email: SEED_MENTOR_EMAIL,
      displayName: 'Ada Lovelace',
      roles: ['mentee'],
      githubLogin: null,
      emailVerifiedAt: null,
    };
    const em = fakeEntityManager({ [SEED_MENTOR_EMAIL]: ada });

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    expect(ada.email).toBe(SEED_MENTOR_EMAIL);
    expect(ada.roles).toEqual(['mentor']);
    expect(ada.githubLogin).toBe('ada');
    expect(ada.emailVerifiedAt).toBeInstanceOf(Date);
    // The two missing personas are still inserted alongside the reconciled row.
    expect(em.create.mock.calls.filter(([entity]) => entity === User)).toHaveLength(2);
  });
});

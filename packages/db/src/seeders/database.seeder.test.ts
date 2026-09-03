import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';
import { DatabaseSeeder, SEED_MENTOR_EMAIL } from './database.seeder';

type FakeEntityManager = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function fakeEntityManager(existingUser: unknown): FakeEntityManager {
  return {
    findOne: vi.fn().mockResolvedValue(existingUser),
    create: vi.fn((_entity: unknown, data: unknown) => data),
  };
}

describe('DatabaseSeeder', () => {
  it('creates the sample mentor and profile on an empty database', async () => {
    const em = fakeEntityManager(null);

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    const user = { email: SEED_MENTOR_EMAIL, displayName: 'Ada Lovelace' };

    expect(em.findOne).toHaveBeenCalledWith(User, { email: SEED_MENTOR_EMAIL });
    expect(em.create).toHaveBeenCalledTimes(2);
    expect(em.create).toHaveBeenNthCalledWith(1, User, user);
    // The fake `create` echoes its data back, so the profile must reference the very
    // object the user creation returned — that link is what makes the 1:1 relation work.
    expect(em.create).toHaveBeenNthCalledWith(2, MentorProfile, {
      user,
      headline: 'Systems & algorithms mentor',
      bio: 'Helping engineers reason about complexity.',
      yearsOfExperience: 12,
    });
  });

  it('is idempotent: seeding an already-seeded database creates nothing', async () => {
    // Regression guard for the unique violation on `users.email` that made a second
    // `npm run db:seed` — and therefore a second `npm run setup` — fail outright.
    const em = fakeEntityManager({ id: 1, email: SEED_MENTOR_EMAIL });

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    expect(em.findOne).toHaveBeenCalledWith(User, { email: SEED_MENTOR_EMAIL });
    expect(em.create).not.toHaveBeenCalled();
  });
});

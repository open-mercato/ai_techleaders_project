import type { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';

/** Email of the sample mentor. `User.email` is unique, so it identifies the seed row. */
export const SEED_MENTOR_EMAIL = 'ada@devmentor.dev';

/**
 * Default seeder — creates one mentor so a fresh database has something to render on
 * the admin users page. Run with `npm run db:seed`.
 *
 * Seeding is **idempotent**: `User.email` carries a unique constraint, so blindly
 * inserting the sample mentor a second time fails with a unique violation. Because
 * `npm run setup` re-runs this seeder on every invocation, the run must be a no-op
 * once the sample mentor is already present.
 */
export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const existing = await em.findOne(User, { email: SEED_MENTOR_EMAIL });

    if (existing) {
      return;
    }

    const user = em.create(User, {
      email: SEED_MENTOR_EMAIL,
      displayName: 'Ada Lovelace',
    });

    em.create(MentorProfile, {
      user,
      headline: 'Systems & algorithms mentor',
      bio: 'Helping engineers reason about complexity.',
      yearsOfExperience: 12,
    });
  }
}

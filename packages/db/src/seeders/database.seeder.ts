import type { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';

/**
 * Default seeder — creates one mentor so a fresh database has something to render on
 * the admin users page. Run with `npm run db:seed`.
 */
export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const user = em.create(User, {
      email: 'ada@devmentor.dev',
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

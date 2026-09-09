import type { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import type { Role } from '../entities/auth/roles';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';

/** Email of the sample mentor. `User.email` is unique, so it identifies the seed row. */
export const SEED_MENTOR_EMAIL = 'ada@devmentor.dev';

/** Email of the sample mentee — `<login>@devmentor.test` for the default mock persona. */
export const SEED_MENTEE_EMAIL = 'mock-mentee@devmentor.test';

/** Email of the sample operator — the address `.github/workflows/ci.yml` allowlists. */
export const SEED_OPERATOR_EMAIL = 'mock-operator@devmentor.test';

interface SeedUser {
  email: string;
  displayName: string;
  roles: Role[];
  githubLogin: string;
}

/**
 * The three personas a fresh database gets, one per role the product recognises.
 *
 * Addresses follow `<login>@devmentor.test` so that a mock GitHub sign-in as that login
 * links to the seeded row instead of creating a second one — the mock identity adapter
 * derives its whole identity from the `login` hint. Ada is the documented exception: her
 * address is `ada@devmentor.dev`, which `BACKWARD_COMPATIBILITY.md` §3 protects and
 * `admin.integration.test.ts` asserts on, and `users.email` is never rewritten. No login
 * can therefore produce her address, so the harness must sign in as `ada` and be matched
 * on `github_id` rather than on email.
 */
const SEED_USERS: readonly SeedUser[] = [
  { email: SEED_MENTOR_EMAIL, displayName: 'Ada Lovelace', roles: ['mentor'], githubLogin: 'ada' },
  {
    email: SEED_MENTEE_EMAIL,
    displayName: 'Mock Mentee',
    roles: ['mentee'],
    githubLogin: 'mock-mentee',
  },
  {
    // The operator also holds `mentor`: the two are independent assignments, and seeding
    // them together keeps a regression that erases one of them visible.
    email: SEED_OPERATOR_EMAIL,
    displayName: 'Mock Operator',
    roles: ['operator', 'mentor'],
    githubLogin: 'mock-operator',
  },
];

/**
 * Default seeder — creates one user per role so a fresh database has something to render
 * on the admin users page and the harness has a row to sign in as. Run with
 * `npm run db:seed`.
 *
 * Seeding is **idempotent**: `User.email` carries a unique constraint, so blindly
 * inserting a persona a second time fails with a unique violation. Because `npm run
 * setup` re-runs this seeder on every invocation, the run must be a no-op once the
 * personas are present.
 *
 * An existing row is reconciled rather than skipped. A database seeded before the
 * `auth-identity` migration has Ada at the column default `{mentee}`, and only the
 * seeder knows she is the mentor — so a migrated database converges on the same state a
 * fresh one is created in. `email` is never rewritten.
 */
export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const seed of SEED_USERS) {
      const existing = await em.findOne(User, { email: seed.email });

      if (existing) {
        existing.displayName = seed.displayName;
        existing.roles = seed.roles;
        existing.githubLogin = seed.githubLogin;
        existing.emailVerifiedAt ??= new Date();
        continue;
      }

      const user = em.create(User, {
        email: seed.email,
        displayName: seed.displayName,
        roles: seed.roles,
        githubLogin: seed.githubLogin,
        emailVerifiedAt: new Date(),
      });

      if (seed.email === SEED_MENTOR_EMAIL) {
        em.create(MentorProfile, {
          user,
          headline: 'Systems & algorithms mentor',
          bio: 'Helping engineers reason about complexity.',
          yearsOfExperience: 12,
        });
      }
    }
  }
}

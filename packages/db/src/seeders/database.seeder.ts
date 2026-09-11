import type { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import type { Role } from '../entities/auth/roles';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';
import { SEED_PASSWORD_HASH } from './seed-password';

/**
 * Email of Ada Lovelace, the admin-list fixture. `User.email` is unique, so it identifies
 * the seed row. Not the mentor a mock sign-in reaches — see `SEED_USERS` below.
 */
export const SEED_MENTOR_EMAIL = 'ada@devmentor.dev';

/** Email of the sample mentee — `<login>@devmentor.test` for the default mock persona. */
export const SEED_MENTEE_EMAIL = 'mock-mentee@devmentor.test';

/** Email of the mentor a mock GitHub sign-in as `mock-mentor` resolves to. */
export const SEED_MOCK_MENTOR_EMAIL = 'mock-mentor@devmentor.test';

/** Email of the sample operator — the address `.github/workflows/ci.yml` allowlists. */
export const SEED_OPERATOR_EMAIL = 'mock-operator@devmentor.test';

interface SeedUser {
  email: string;
  displayName: string;
  roles: Role[];
  githubLogin: string;
  /**
   * Whether this persona can sign in with `SEED_PASSWORD` as well as through GitHub.
   * Absent means `password_hash` stays null, which is the GitHub-only account shape.
   */
  password?: true;
  /** Planted at creation only — see the note on `run` about what the seeder owns. */
  profile?: { headline: string; bio: string; yearsOfExperience: number };
}

/**
 * The four personas a fresh database gets.
 *
 * Three of them exist to be signed in as. The mock GitHub identity adapter derives an
 * entire identity from its `login` hint — a stable id, that login, and
 * `<login>@devmentor.test` as the verified primary email — so a persona is reachable by
 * mock sign-in only when its address is exactly `<its own login>@devmentor.test`.
 * `mock-mentee`, `mock-mentor` and `mock-operator` satisfy that, and the harness signs in
 * as whichever one a scenario needs.
 *
 * Ada is the fourth and is deliberately *not* reachable. Her address is
 * `ada@devmentor.dev` — protected by `BACKWARD_COMPATIBILITY.md` §3 and asserted on cell
 * by cell in `tests/integration/admin.integration.test.ts` — and no login can produce it,
 * while `users.email` is never rewritten on an existing row. She is the admin-list
 * fixture: the row and the mentor-profile headline those assertions describe. A mock
 * sign-in "as Ada" would match her on neither `github_id` nor `email`, fall through to the
 * create branch and leave a *second* Ada behind, so mentor scenarios use `mock-mentor`.
 *
 * That is why there are two mentors. The alternatives were rejected on purpose: seeding
 * Ada a `github_id` taken from the mock adapter's id scheme would put one constant on both
 * sides of the `db`/`core` boundary and need a drift guard to keep it there, and renaming
 * her address would need a §3 amendment plus an exception to the never-rewrite-email rule.
 *
 * **Two of the four carry a password**, `mock-mentee` and `mock-operator`, which is what the
 * spec's seeder paragraph names: one unprivileged persona and one privileged one, so the
 * form-based sign-in scenarios can reach both a mentee surface and `/admin` without GitHub.
 * The other two are deliberately password-less rather than merely unfinished. Ada is the
 * admin-list fixture and is not signed in as at all. Mock Mentor is the persona a *mock
 * GitHub* sign-in resolves to, so leaving her `password_hash` null keeps a live example of
 * the GitHub-only account shape — the row `registerWithPassword` must answer with a 409
 * pointing at GitHub rather than by writing a hash. Nothing in E01 needs a third
 * form-signin persona; the day something does, adding `password: true` is the whole change.
 */
const SEED_USERS: readonly SeedUser[] = [
  {
    email: SEED_MENTOR_EMAIL,
    displayName: 'Ada Lovelace',
    roles: ['mentor'],
    githubLogin: 'ada',
    profile: {
      headline: 'Systems & algorithms mentor',
      bio: 'Helping engineers reason about complexity.',
      yearsOfExperience: 12,
    },
  },
  {
    email: SEED_MENTEE_EMAIL,
    displayName: 'Mock Mentee',
    roles: ['mentee'],
    githubLogin: 'mock-mentee',
    password: true,
  },
  {
    // Carries a profile because `/mentor` and everything E02 hangs off `mentor_profiles`
    // (slots, prices) need one to render, and this is the only mentor the harness can
    // actually sign in as. The headline differs from Ada's so an assertion on either row
    // stays unambiguous.
    email: SEED_MOCK_MENTOR_EMAIL,
    displayName: 'Mock Mentor',
    roles: ['mentor'],
    githubLogin: 'mock-mentor',
    profile: {
      headline: 'Mock mentor for sign-in scenarios',
      bio: 'Seeded so a mock GitHub sign-in lands on a mentor that already has a profile.',
      yearsOfExperience: 5,
    },
  },
  {
    // The operator also holds `mentor`: the two are independent assignments, and seeding
    // them together keeps a regression that erases one of them visible.
    email: SEED_OPERATOR_EMAIL,
    displayName: 'Mock Operator',
    roles: ['operator', 'mentor'],
    githubLogin: 'mock-operator',
    password: true,
  },
];

/**
 * Default seeder — creates the `SEED_USERS` personas so a fresh database has something to
 * render on the admin users page and the harness has rows to sign in as. Run with
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
 *
 * A `MentorProfile` is **planted at creation and never reconciled**, which is the line
 * between what the seeder owns and what the product owns: identity (display name, roles,
 * GitHub login, verification) is seeder-owned plumbing nothing else can restore, while a
 * profile is user-editable content whose very existence is a product state — a mentor
 * without one is legitimate, as Mock Operator shows. Re-seeding must not resurrect a
 * profile a mentor deleted, nor overwrite a headline they wrote.
 *
 * `passwordHash` sits on the product side of that line, so it is filled in when absent and
 * **never overwritten** — the same `??=` treatment as `emailVerifiedAt` rather than the
 * unconditional rewrite identity gets. Filling it in is what carries a database seeded
 * before the `auth-password` migration to the state a fresh one is created in; not
 * overwriting it is what stops a re-seed from silently resetting a password somebody
 * changed. A persona without `password: true` reconciles to `null`, which leaves an
 * existing hash alone as well: assigning null over null is not a write, so a second
 * `db:seed` issues no `UPDATE` and no row's `updated_at` moves.
 */
export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const seed of SEED_USERS) {
      const existing = await em.findOne(User, { email: seed.email });

      const passwordHash = seed.password ? SEED_PASSWORD_HASH : null;

      if (existing) {
        existing.displayName = seed.displayName;
        existing.roles = seed.roles;
        existing.githubLogin = seed.githubLogin;
        existing.emailVerifiedAt ??= new Date();
        existing.passwordHash ??= passwordHash;
        continue;
      }

      const user = em.create(User, {
        email: seed.email,
        displayName: seed.displayName,
        roles: seed.roles,
        githubLogin: seed.githubLogin,
        emailVerifiedAt: new Date(),
        passwordHash,
      });

      if (seed.profile) {
        em.create(MentorProfile, { user, ...seed.profile });
      }
    }
  }
}

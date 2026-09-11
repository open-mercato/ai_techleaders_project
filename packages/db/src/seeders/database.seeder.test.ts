import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../entities/auth/user.entity';
import { MentorProfile } from '../entities/mentors/mentor-profile.entity';
import {
  DatabaseSeeder,
  SEED_MENTEE_EMAIL,
  SEED_MENTOR_EMAIL,
  SEED_MOCK_MENTOR_EMAIL,
  SEED_OPERATOR_EMAIL,
} from './database.seeder';
import { SEED_PASSWORD_HASH } from './seed-password';

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
  it('creates every verified persona on an empty database', async () => {
    const em = fakeEntityManager();

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    expect(em.findOne).toHaveBeenNthCalledWith(1, User, { email: SEED_MENTOR_EMAIL });
    expect(em.findOne).toHaveBeenNthCalledWith(2, User, { email: SEED_MENTEE_EMAIL });
    expect(em.findOne).toHaveBeenNthCalledWith(3, User, { email: SEED_MOCK_MENTOR_EMAIL });
    expect(em.findOne).toHaveBeenNthCalledWith(4, User, { email: SEED_OPERATOR_EMAIL });

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
        passwordHash: null,
      },
      {
        email: SEED_MENTEE_EMAIL,
        displayName: 'Mock Mentee',
        roles: ['mentee'],
        githubLogin: 'mock-mentee',
        emailVerifiedAt: expect.any(Date),
        passwordHash: SEED_PASSWORD_HASH,
      },
      {
        email: SEED_MOCK_MENTOR_EMAIL,
        displayName: 'Mock Mentor',
        roles: ['mentor'],
        githubLogin: 'mock-mentor',
        emailVerifiedAt: expect.any(Date),
        passwordHash: null,
      },
      {
        // The operator holds `mentor` too: the two are independent assignments, and a
        // regression that lets one erase the other has to fail somewhere.
        email: SEED_OPERATOR_EMAIL,
        displayName: 'Mock Operator',
        roles: ['operator', 'mentor'],
        githubLogin: 'mock-operator',
        emailVerifiedAt: expect.any(Date),
        passwordHash: SEED_PASSWORD_HASH,
      },
    ]);
  });

  it('gives a password to the mentee and the operator, and to nobody else', async () => {
    // One unprivileged persona and one privileged one, so a form sign-in can reach both a
    // mentee surface and `/admin`. Ada is never signed in as, and Mock Mentor stays
    // GitHub-only on purpose: she is the live example of the `github_id` set /
    // `password_hash` null row that `registerWithPassword` answers with a 409.
    const em = fakeEntityManager();

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    const byEmail = new Map(
      em.create.mock.calls
        .filter(([entity]) => entity === User)
        .map(([, data]) => data as { email: string; passwordHash: string | null })
        .map((user) => [user.email, user.passwordHash]),
    );

    expect(Object.fromEntries(byEmail)).toEqual({
      [SEED_MENTOR_EMAIL]: null,
      [SEED_MENTEE_EMAIL]: SEED_PASSWORD_HASH,
      [SEED_MOCK_MENTOR_EMAIL]: null,
      [SEED_OPERATOR_EMAIL]: SEED_PASSWORD_HASH,
    });
  });

  it('addresses every persona except Ada as <githubLogin>@devmentor.test', async () => {
    // The mock identity adapter derives `<login>@devmentor.test` from its `login` hint, so
    // a drifting address silently makes a persona unreachable by sign-in — it would create
    // a second row rather than link. Ada is the deliberate exception: she is the
    // admin-list fixture, `BACKWARD_COMPATIBILITY.md` §3 pins her address, and no login can
    // produce it.
    const em = fakeEntityManager();

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    const created = em.create.mock.calls
      .filter(([entity]) => entity === User)
      .map(([, data]) => data as { email: string; githubLogin: string });

    expect(created.map((user) => user.email)).toContain(SEED_MENTOR_EMAIL);
    for (const user of created.filter(({ email }) => email !== SEED_MENTOR_EMAIL)) {
      expect(user.email).toBe(`${user.githubLogin}@devmentor.test`);
    }
  });

  it('gives each profile-bearing mentor a profile linked to the user object just created', async () => {
    const em = fakeEntityManager();

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    const profiles = em.create.mock.calls
      .filter(([entity]) => entity === MentorProfile)
      .map(([, data]) => data);

    // Ada carries the headline `admin.integration.test.ts` asserts on; Mock Mentor is the
    // mentor the harness signs in as, and needs a profile for `/mentor` to have anything
    // to render. Mock Mentee and Mock Operator get none — holding the `mentor` role and
    // having a profile are independent.
    expect(profiles).toEqual([
      {
        user: expect.objectContaining({ email: SEED_MENTOR_EMAIL }),
        headline: 'Systems & algorithms mentor',
        bio: 'Helping engineers reason about complexity.',
        yearsOfExperience: 12,
      },
      {
        user: expect.objectContaining({ email: SEED_MOCK_MENTOR_EMAIL }),
        headline: 'Mock mentor for sign-in scenarios',
        bio: 'Seeded so a mock GitHub sign-in lands on a mentor that already has a profile.',
        yearsOfExperience: 5,
      },
    ]);
    // Distinct headlines: an assertion on either row must not be able to match the other.
    expect(new Set(profiles.map((profile) => (profile as { headline: string }).headline)).size).toBe(
      2,
    );
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
        passwordHash: null,
      },
      [SEED_MENTEE_EMAIL]: {
        email: SEED_MENTEE_EMAIL,
        emailVerifiedAt: new Date(),
        // Deliberately *not* the seeded hash: a developer who changed this persona's
        // password must not have it reset by the next `npm run setup`.
        passwordHash: '$scrypt$ln=17,r=8,p=1$c29tZS1vdGhlci1zYWx0$YS1kaWZmZXJlbnQtZGlnZXN0',
      },
      [SEED_MOCK_MENTOR_EMAIL]: {
        email: SEED_MOCK_MENTOR_EMAIL,
        emailVerifiedAt: new Date(),
        passwordHash: null,
      },
      [SEED_OPERATOR_EMAIL]: {
        email: SEED_OPERATOR_EMAIL,
        emailVerifiedAt: new Date(),
        passwordHash: SEED_PASSWORD_HASH,
      },
    };
    const em = fakeEntityManager(rows);

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    // No second `mentor_profiles` row either: a profile is planted at creation only, so
    // re-seeding cannot resurrect one a mentor deleted or duplicate one they still have.
    expect(em.create).not.toHaveBeenCalled();
    // An already-verified row keeps its original timestamp — re-seeding must not look
    // like a fresh verification.
    expect(rows[SEED_MENTOR_EMAIL].emailVerifiedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
    // Neither an existing password nor an absent one is rewritten, so a second `db:seed`
    // issues no `UPDATE` at all and no row's `updated_at` moves. `null` reconciling to
    // `null` is what makes that true for the two GitHub-only personas.
    expect(rows[SEED_MENTEE_EMAIL].passwordHash).toBe(
      '$scrypt$ln=17,r=8,p=1$c29tZS1vdGhlci1zYWx0$YS1kaWZmZXJlbnQtZGlnZXN0',
    );
    expect(rows[SEED_OPERATOR_EMAIL].passwordHash).toBe(SEED_PASSWORD_HASH);
    expect(rows[SEED_MENTOR_EMAIL].passwordHash).toBeNull();
    expect(rows[SEED_MOCK_MENTOR_EMAIL].passwordHash).toBeNull();
  });

  it('plants the hash on personas that predate the auth-password column', async () => {
    // The migration adds `password_hash` as null for every existing row, so a database that
    // was migrated rather than created has the two form-signin personas without a
    // credential. Re-seeding is what converges it on the state a fresh database starts in.
    const mentee: Record<string, unknown> = { email: SEED_MENTEE_EMAIL, emailVerifiedAt: new Date() };
    const mockMentor: Record<string, unknown> = {
      email: SEED_MOCK_MENTOR_EMAIL,
      emailVerifiedAt: new Date(),
    };
    const em = fakeEntityManager({
      [SEED_MENTEE_EMAIL]: mentee,
      [SEED_MOCK_MENTOR_EMAIL]: mockMentor,
    });

    await new DatabaseSeeder().run(em as unknown as EntityManager);

    expect(mentee.passwordHash).toBe(SEED_PASSWORD_HASH);
    // A persona without a seeded password stays without one rather than acquiring the
    // shared fixture hash: `null` is the GitHub-only account shape, not a gap.
    expect(mockMentor.passwordHash).toBeNull();
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
    // The three missing personas are still inserted alongside the reconciled row, and
    // reconciling Ada must not re-create the profile she already has.
    expect(em.create.mock.calls.filter(([entity]) => entity === User)).toHaveLength(3);
    expect(em.create.mock.calls.filter(([entity]) => entity === MentorProfile)).toHaveLength(1);
  });
});

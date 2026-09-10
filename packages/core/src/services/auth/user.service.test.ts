import { UniqueConstraintViolationException, type EntityManager, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env';
import { EventBus } from '../../events/event-bus';
import type { EventMap } from '../../events/event-map';
import type { Session } from '../../http/auth';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { Logger } from '../../logger';
import type { Clock } from '../../time/clock';
import { UserService, type GithubIdentityInput, type UserCreateInput } from './user.service';

/**
 * Test seam for `UserService`.
 *
 * The `em` is a fake rather than a mock because the behaviour under test *is* a
 * check-then-write: the matching order, the linking rule and the identity race are all
 * statements about what a second reader sees after a first writer commits. A per-call
 * `vi.fn()` chain would let each case assert its own fiction. `FakeDb` instead keeps rows,
 * enforces the two identity unique constraints at flush time exactly as PostgreSQL does,
 * and yields to the event loop on every await point — so two concurrent sign-ins really do
 * interleave, one really does lose on `users_email_unique`, and the recovery path is
 * reached for the real reason.
 *
 * What it cannot reproduce is two genuine database transactions with genuine isolation:
 * the fake commits pending inserts synchronously inside `flush`. The transaction *boundary*
 * is asserted (a clear fork per attempt, no partial announcement on the losing attempt),
 * but the isolation guarantee itself belongs to the integration suite.
 */

const NOW = new Date('2026-09-09T12:00:00.000Z');
const EARLIER = new Date('2026-09-01T00:00:00.000Z');

interface Row {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  githubId: string | null;
  githubLogin: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
  mentorProfile: { id: string; headline: string } | null;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'user-seed',
    email: 'ada@devmentor.dev',
    displayName: 'Ada Lovelace',
    roles: ['mentee'],
    githubId: null,
    githubLogin: null,
    avatarUrl: null,
    emailVerifiedAt: EARLIER,
    sessionVersion: 0,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    mentorProfile: null,
    ...overrides,
  };
}

/** Hand control back to the event loop, so concurrent callers actually interleave. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** The shape MikroORM's wrapper carries: the original `pg` error's own properties. */
function uniqueViolation(constraint: string): UniqueConstraintViolationException {
  const driverError = Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    { code: '23505', constraint, table: 'users' },
  );
  return new UniqueConstraintViolationException(driverError);
}

class FakeDb {
  rows: Row[] = [];
  /** Every `transactional` call, so "one attempt or two" is observable. */
  attempts = 0;
  /** Queued failures, one per `flush`, standing in for a concurrent writer. */
  flushFailures: unknown[] = [];
  /** Every collection read, so "denied before the data was touched" is observable. */
  finds = 0;
  private nextId = 1;

  em(): EntityManager {
    // Per-`em` and not per-`FakeDb`: each concurrent caller owns its own unit of work, and
    // sharing one would let the callers clear each other's pending inserts — the exact
    // isolation the race test is about.
    let pending: Row[] = [];
    const fake = {
      transactional: async <T>(
        cb: (tx: EntityManager) => Promise<T>,
        options: { clear?: boolean },
      ): Promise<T> => {
        this.attempts += 1;
        // `clear: true` is what stops a retry inheriting the losing attempt's unit of work.
        expect(options).toEqual({ clear: true });
        pending = [];
        return cb(em);
      },
      findOne: async (
        _entity: unknown,
        where: { id?: string; email?: string; githubId?: string },
      ): Promise<Row | null> => {
        await tick();
        return (
          this.rows.find(
            (candidate) =>
              (where.id === undefined || candidate.id === where.id) &&
              (where.email === undefined || candidate.email === where.email) &&
              (where.githubId === undefined || candidate.githubId === where.githubId),
          ) ?? null
        );
      },
      find: async (): Promise<Row[]> => {
        this.finds += 1;
        await tick();
        return [...this.rows];
      },
      create: (_entity: unknown, data: Partial<Row>): Row => ({
        ...row({
          id: `user-${this.nextId++}`,
          createdAt: NOW,
          updatedAt: NOW,
          emailVerifiedAt: null,
        }),
        ...data,
      }),
      persist: (entity: Row): void => {
        pending.push(entity);
      },
      flush: async (): Promise<void> => {
        await tick();
        if (this.flushFailures.length > 0) {
          throw this.flushFailures.shift();
        }
        for (const inserted of pending) {
          // The two constraints, enforced where PostgreSQL enforces them.
          if (this.rows.some((existing) => existing.email === inserted.email)) {
            throw uniqueViolation('users_email_unique');
          }
          if (
            inserted.githubId !== null &&
            this.rows.some((existing) => existing.githubId === inserted.githubId)
          ) {
            throw uniqueViolation('users_github_id_unique');
          }
          this.rows.push(inserted);
        }
        pending = [];
      },
    };
    const em = fake as unknown as EntityManager;
    return em;
  }
}

const IDENTITY: GithubIdentityInput = {
  githubId: '4242',
  githubLogin: 'ada',
  email: 'ada@devmentor.dev',
  displayName: 'Ada Lovelace',
  avatarUrl: 'https://avatars.example/ada.png',
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const clock: Clock = { now: () => NOW };

let db: FakeDb;
let eventBus: EventBus;
let emitted: Array<{ id: string; payload: unknown }>;

/**
 * The scoped `session` key, as awilix hands it over: a promise, resolved at most once per
 * request. `null` — nobody signed in — is the default, because every method except `list`
 * is reached from an unauthenticated path (sign-in) or from no route at all.
 */
function sessionOf(...roles: Role[]): Promise<Session | null> {
  const [first, ...rest] = roles;
  return Promise.resolve(
    first === undefined ? null : { userId: 'caller-1', roles: [first, ...rest] },
  );
}

function makeService(
  operatorEmails: readonly string[] = [],
  session: Promise<Session | null> = sessionOf(),
): UserService {
  return new UserService({
    em: db.em(),
    logger,
    eventBus,
    env: { OPERATOR_EMAILS: operatorEmails } as unknown as AppEnv,
    clock,
    session,
  });
}

function rolesChangedEvents(): Array<EventMap['auth.user.roles_changed']> {
  return emitted
    .filter((event) => event.id === 'auth.user.roles_changed')
    .map((event) => event.payload as EventMap['auth.user.roles_changed']);
}

beforeEach(() => {
  vi.clearAllMocks();
  db = new FakeDb();
  emitted = [];
  eventBus = new EventBus({ logger });
  eventBus.on('auth.user.created', (payload) => {
    emitted.push({ id: 'auth.user.created', payload });
  });
  eventBus.on('auth.user.roles_changed', (payload) => {
    emitted.push({ id: 'auth.user.roles_changed', payload });
  });
});

describe('list', () => {
  it('maps every row to a DTO, including the mentor profile', async () => {
    db.rows.push(
      row({
        id: 'user-1',
        githubLogin: 'ada',
        avatarUrl: 'https://avatars.example/ada.png',
        mentorProfile: { id: 'profile-1', headline: 'Analytical engines' },
      }),
    );

    await expect(makeService([], sessionOf('operator')).list()).resolves.toEqual([
      {
        id: 'user-1',
        email: 'ada@devmentor.dev',
        displayName: 'Ada Lovelace',
        roles: ['mentee'],
        githubLogin: 'ada',
        avatarUrl: 'https://avatars.example/ada.png',
        createdAt: EARLIER.toISOString(),
        mentorProfile: { id: 'profile-1', headline: 'Analytical engines' },
      },
    ]);
  });

  it('reports absent identity columns as null rather than dropping them', async () => {
    db.rows.push(row({ id: 'user-1' }));

    const [dto] = await makeService([], sessionOf('operator')).list();

    expect(dto).toMatchObject({ githubLogin: null, avatarUrl: null, mentorProfile: null });
  });

  it('serves an operator who also holds another role', async () => {
    // Membership, not equality: mentor and operator are independent assignments.
    db.rows.push(row({ id: 'user-1' }));

    await expect(
      makeService([], sessionOf('mentee', 'mentor', 'operator')).list(),
    ).resolves.toHaveLength(1);
  });

  it('refuses an anonymous caller with 401, before reading a single row', async () => {
    db.rows.push(row({ id: 'user-1' }));

    await expect(makeService([], sessionOf()).list()).rejects.toThrow(UnauthorizedError);
    // The refusal is the service's own, not the route's, and it happens before the query:
    // `/api/users` is guarded twice on purpose (edge case 21).
    expect(db.finds).toBe(0);
  });

  it.each<[string, Role[]]>([
    ['mentee', ['mentee']],
    ['mentor', ['mentor']],
    ['mentee and mentor', ['mentee', 'mentor']],
  ])('refuses a signed-in %s with 403, before reading a single row', async (_label, roles) => {
    db.rows.push(row({ id: 'user-1' }));

    // 403 rather than 401: the caller is authenticated, so signing in again would not help.
    await expect(makeService([], sessionOf(...roles)).list()).rejects.toThrow(ForbiddenError);
    expect(db.finds).toBe(0);
  });

  it('propagates a failure to resolve the session rather than serving the list', async () => {
    // The two things `resolveSessionFromCookie` can throw are a missing SESSION_SECRET and
    // a corrupt role set (edge case 30b). Neither is an answer to "may this caller list
    // users?", so neither may be swallowed — and the constructor's `catch` marks the
    // rejection handled without changing what `list` sees.
    const failure = new Error('SESSION_SECRET is not set');
    const service = makeService([], Promise.reject(failure));

    await expect(service.list()).rejects.toThrow(failure);
    expect(db.finds).toBe(0);
  });
});

describe('findByEmail', () => {
  it('answers with the row, or null when there is none', async () => {
    db.rows.push(row({ id: 'user-1' }));
    const service = makeService();

    await expect(service.findByEmail('ada@devmentor.dev')).resolves.toMatchObject({
      id: 'user-1',
    });
    await expect(service.findByEmail('nobody@devmentor.dev')).resolves.toBeNull();
  });
});

describe('create', () => {
  it('persists the row and announces auth.user.created', async () => {
    const dto = await makeService().create({
      email: 'grace@devmentor.dev',
      displayName: 'Grace Hopper',
    });

    expect(dto).toMatchObject({ email: 'grace@devmentor.dev', roles: ['mentee'] });
    expect(emitted).toEqual([
      { id: 'auth.user.created', payload: { userId: dto.id, email: 'grace@devmentor.dev' } },
    ]);
  });

  it('cannot set roles or any other privileged column, whatever the caller passes', async () => {
    // The mass-assignment regression. `em.create(User, data)` would have written every one
    // of these, and TypeScript would not have stopped it: the excess-property check only
    // fires on object *literals*, so a widened object assigned to `UserCreateInput` reaches
    // the method with its extra keys intact. Modelled here as exactly that — a value the
    // compiler has already lost sight of.
    const widened = {
      email: 'mallory@devmentor.dev',
      displayName: 'Mallory',
      roles: ['operator'],
      sessionVersion: 99,
      githubId: '4242',
      githubLogin: 'mallory',
      emailVerifiedAt: NOW,
    } as unknown as UserCreateInput;

    const dto = await makeService().create(widened);

    expect(dto.roles).toEqual(['mentee']);
    expect(db.rows).toEqual([
      expect.objectContaining({
        email: 'mallory@devmentor.dev',
        displayName: 'Mallory',
        roles: ['mentee'],
        sessionVersion: 0,
        githubId: null,
        githubLogin: null,
        // Unverified, which is what keeps the row unlinkable by a GitHub identity.
        emailVerifiedAt: null,
      }),
    ]);
  });

  it('does not require a session: registration is a public path', async () => {
    // `create` is not the guarded surface — `list` is. Slice 4's password registration is
    // the next caller and has no session by definition.
    await expect(
      makeService([], sessionOf()).create({
        email: 'grace@devmentor.dev',
        displayName: 'Grace Hopper',
      }),
    ).resolves.toMatchObject({ email: 'grace@devmentor.dev' });
  });
});

describe('findOrCreateFromGithub — matching order', () => {
  it('matches an already-linked github_id without creating or claiming anything', async () => {
    db.rows.push(row({ id: 'user-1', githubId: '4242', githubLogin: 'ada-old' }));

    const result = await makeService().findOrCreateFromGithub(IDENTITY);

    expect(result).toEqual({
      user: expect.objectContaining({ id: 'user-1', roles: ['mentee'] }),
      sessionVersion: 0,
    });
    expect(db.rows).toHaveLength(1);
    // The match branches never announce a creation.
    expect(emitted).toEqual([]);
  });

  it('refreshes the display-only GitHub fields on an existing row', async () => {
    db.rows.push(row({ id: 'user-1', githubId: '4242', githubLogin: 'ada-old', avatarUrl: null }));

    const { user } = await makeService().findOrCreateFromGithub(IDENTITY);

    expect(user).toMatchObject({
      githubLogin: 'ada',
      avatarUrl: 'https://avatars.example/ada.png',
    });
  });

  it('links the identity onto a locally verified email match', async () => {
    // Edge case 5: one account, not two.
    db.rows.push(row({ id: 'user-1', emailVerifiedAt: EARLIER }));

    const { user } = await makeService().findOrCreateFromGithub(IDENTITY);

    expect(user.id).toBe('user-1');
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.githubId).toBe('4242');
    expect(emitted).toEqual([]);
  });

  it('never rewrites users.email when linking, whatever GitHub now reports', async () => {
    // Edge case 26. `users.email` is the authorization key under the live operator check,
    // so rewriting it here would silently revoke a founder's access.
    db.rows.push(row({ id: 'user-1', email: 'ada@devmentor.dev', displayName: 'Ada L.' }));

    await makeService(['ada@devmentor.dev']).findOrCreateFromGithub({
      ...IDENTITY,
      displayName: 'Ada from GitHub',
    });

    expect(db.rows[0]?.email).toBe('ada@devmentor.dev');
    // `displayName` is the user's own field too, and is left alone for the same reason.
    expect(db.rows[0]?.displayName).toBe('Ada L.');
  });

  it('refuses an email match on an unverified row, linking and creating nothing', async () => {
    // Edge case 4. Matching on email alone is an account-takeover vector.
    db.rows.push(row({ id: 'user-1', emailVerifiedAt: null }));

    await expect(makeService().findOrCreateFromGithub(IDENTITY)).rejects.toThrow(ConflictError);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.githubId).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('tells the refused user what to do about it', async () => {
    db.rows.push(row({ id: 'user-1', emailVerifiedAt: null }));

    await expect(makeService().findOrCreateFromGithub(IDENTITY)).rejects.toThrow(
      /has not been confirmed yet/,
    );
  });

  it('creates a verified mentee when nothing matches, and announces it', async () => {
    const { user, sessionVersion } = await makeService().findOrCreateFromGithub(IDENTITY);

    expect(user).toMatchObject({
      email: 'ada@devmentor.dev',
      displayName: 'Ada Lovelace',
      roles: ['mentee'],
      githubLogin: 'ada',
      avatarUrl: 'https://avatars.example/ada.png',
    });
    expect(sessionVersion).toBe(0);
    expect(db.rows[0]?.emailVerifiedAt).toEqual(NOW);
    expect(emitted).toEqual([
      { id: 'auth.user.created', payload: { userId: user.id, email: 'ada@devmentor.dev' } },
    ]);
  });
});

describe('findOrCreateFromGithub — operator reconciliation', () => {
  it('promotes an allowlisted verified row and announces the change', async () => {
    // Edge case 25.
    db.rows.push(row({ id: 'user-1', githubId: '4242', roles: ['mentee'] }));

    const { user } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub(IDENTITY);

    expect(user.roles).toEqual(['mentee', 'operator']);
    expect(db.rows[0]?.roles).toEqual(['mentee', 'operator']);
    expect(rolesChangedEvents()).toEqual([
      {
        userId: 'user-1',
        roles: ['mentee', 'operator'],
        previousRoles: ['mentee'],
        reason: 'reconciled',
      },
    ]);
  });

  it('demotes a row whose address left the allowlist', async () => {
    // Edge case 24, the direction a sign-in-only reconciliation would never reach.
    db.rows.push(row({ id: 'user-1', githubId: '4242', roles: ['mentee', 'operator'] }));

    const { user } = await makeService([]).findOrCreateFromGithub(IDENTITY);

    expect(user.roles).toEqual(['mentee']);
    expect(rolesChangedEvents()).toEqual([
      {
        userId: 'user-1',
        roles: ['mentee'],
        previousRoles: ['mentee', 'operator'],
        reason: 'reconciled',
      },
    ]);
  });

  it('keeps mentor membership across a promotion', async () => {
    db.rows.push(row({ id: 'user-1', githubId: '4242', roles: ['mentee', 'mentor'] }));

    const { user } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub(IDENTITY);

    expect(user.roles).toEqual(['mentee', 'mentor', 'operator']);
  });

  it('keeps mentor membership across a demotion', async () => {
    db.rows.push(
      row({ id: 'user-1', githubId: '4242', roles: ['mentee', 'mentor', 'operator'] }),
    );

    const { user } = await makeService([]).findOrCreateFromGithub(IDENTITY);

    expect(user.roles).toEqual(['mentee', 'mentor']);
  });

  it('never promotes an allowlisted address on an unverified row', async () => {
    // Reached through the `github_id` branch, which is the only way an unverified row can
    // sign in at all: the email branch refuses it outright.
    db.rows.push(row({ id: 'user-1', githubId: '4242', emailVerifiedAt: null }));

    const { user } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub(IDENTITY);

    expect(user.roles).toEqual(['mentee']);
    expect(rolesChangedEvents()).toEqual([]);
  });

  it('matches the allowlist case-insensitively and ignores stored whitespace', async () => {
    db.rows.push(
      row({ id: 'user-1', githubId: '4242', email: '  Ada@DevMentor.DEV ' }),
    );

    const { user } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub({
      ...IDENTITY,
      email: '  Ada@DevMentor.DEV ',
    });

    expect(user.roles).toEqual(['mentee', 'operator']);
  });

  it('promotes a brand-new founder in the creating INSERT, so their first landing is right', async () => {
    const { user } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub(IDENTITY);

    expect(user.roles).toEqual(['mentee', 'operator']);
    // Creation is announced first; the cache write is announced as what it is.
    expect(emitted.map((event) => event.id)).toEqual([
      'auth.user.created',
      'auth.user.roles_changed',
    ]);
  });

  it('is idempotent: an unchanged membership writes nothing and announces nothing', async () => {
    db.rows.push(row({ id: 'user-1', githubId: '4242', roles: ['mentee', 'operator'] }));
    const service = makeService(['ada@devmentor.dev']);

    await service.findOrCreateFromGithub(IDENTITY);
    await service.findOrCreateFromGithub(IDENTITY);

    expect(rolesChangedEvents()).toEqual([]);
  });

  it('normalizes a denormalized stored set without claiming the membership changed', async () => {
    db.rows.push(
      row({ id: 'user-1', githubId: '4242', roles: ['operator', 'mentee', 'mentee'] }),
    );

    const { user } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub(IDENTITY);

    // Order-stable and duplicate-free in the DTO, and no event, because nothing moved.
    expect(user.roles).toEqual(['mentee', 'operator']);
    expect(rolesChangedEvents()).toEqual([]);
  });

  it('leaves session_version untouched, because a page render cannot re-issue a cookie', async () => {
    db.rows.push(row({ id: 'user-1', githubId: '4242', roles: ['mentee'], sessionVersion: 7 }));

    const { sessionVersion } = await makeService(['ada@devmentor.dev']).findOrCreateFromGithub(
      IDENTITY,
    );

    expect(sessionVersion).toBe(7);
    expect(db.rows[0]?.sessionVersion).toBe(7);
  });

  it('refuses to write an empty role set, reporting the row as corrupt', async () => {
    db.rows.push(row({ id: 'user-1', githubId: '4242', roles: ['operator'] }));

    await expect(makeService([]).findOrCreateFromGithub(IDENTITY)).rejects.toThrow(
      /derived an empty role set/,
    );
    expect(db.rows[0]?.roles).toEqual(['operator']);
  });
});

describe('findOrCreateFromGithub — the identity race', () => {
  it('resolves two concurrent sign-ins for a new user to one row and two sessions', async () => {
    // Edge case 9. Both callers reach `findOne` before either flushes, so both try to
    // insert; the store rejects the second on `users_email_unique` exactly as PostgreSQL
    // would, and the loser re-reads the winner.
    const [first, second] = await Promise.all([
      makeService().findOrCreateFromGithub(IDENTITY),
      makeService().findOrCreateFromGithub(IDENTITY),
    ]);

    expect(db.rows).toHaveLength(1);
    expect(first.user.id).toBe(db.rows[0]?.id);
    expect(second.user.id).toBe(first.user.id);
    expect(db.attempts).toBe(3);
    // Exactly one creation was announced: the losing attempt rolled back, so it announced
    // nothing at all.
    expect(emitted.filter((event) => event.id === 'auth.user.created')).toHaveLength(1);
  });

  it('recovers from losing on users_github_id_unique by re-reading the winner', async () => {
    db.flushFailures = [uniqueViolation('users_github_id_unique')];
    const service = makeService();
    const winner = row({ id: 'user-winner', githubId: '4242', githubLogin: 'ada' });

    // The winner commits while our attempt is in flight; the retry's first lookup finds it.
    const pending = service.findOrCreateFromGithub(IDENTITY);
    db.rows.push(winner);

    await expect(pending).resolves.toMatchObject({ user: { id: 'user-winner' } });
    expect(db.attempts).toBe(2);
    expect(emitted).toEqual([]);
  });

  it('applies the verification rule to the row it re-reads', async () => {
    // B10: the winner is linked only when its own `email_verified_at` is set. A recovered
    // race is not a way around the linking rule.
    db.flushFailures = [uniqueViolation('users_email_unique')];
    const service = makeService();

    const pending = service.findOrCreateFromGithub(IDENTITY);
    db.rows.push(row({ id: 'user-winner', emailVerifiedAt: null }));

    await expect(pending).rejects.toThrow(ConflictError);
  });

  it('rethrows a unique violation on an unrelated constraint instead of retrying', async () => {
    db.flushFailures = [uniqueViolation('mentor_profiles_user_id_unique')];

    await expect(makeService().findOrCreateFromGithub(IDENTITY)).rejects.toThrow(
      /mentor_profiles_user_id_unique/,
    );
    expect(db.attempts).toBe(1);
  });

  it('rethrows a unique violation that names no constraint', async () => {
    db.flushFailures = [new UniqueConstraintViolationException(new Error('duplicate key'))];

    await expect(makeService().findOrCreateFromGithub(IDENTITY)).rejects.toThrow('duplicate key');
    expect(db.attempts).toBe(1);
  });

  it('rethrows an error that is not a constraint violation at all', async () => {
    db.flushFailures = [new Error('connection terminated')];

    await expect(makeService().findOrCreateFromGithub(IDENTITY)).rejects.toThrow(
      'connection terminated',
    );
    expect(db.attempts).toBe(1);
  });

  it('does not retry twice: a second loss is a defect, not a race', async () => {
    // Losing the same constraint twice in a row is not contention, and a recovery that
    // retried indefinitely would turn a permanent fault into a loop.
    db.flushFailures = [
      uniqueViolation('users_email_unique'),
      uniqueViolation('users_email_unique'),
    ];

    await expect(makeService().findOrCreateFromGithub(IDENTITY)).rejects.toThrow(
      /users_email_unique/,
    );
    expect(db.attempts).toBe(2);
  });
});

describe('grantRole / revokeRole', () => {
  it('adds a role, preserves the others, and bumps session_version', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentee'], sessionVersion: 3 }));

    const result = await makeService().grantRole('user-1', 'mentor');

    expect(result.user.roles).toEqual(['mentee', 'mentor']);
    expect(result.sessionVersion).toBe(4);
    expect(db.rows[0]?.sessionVersion).toBe(4);
    expect(rolesChangedEvents()).toEqual([
      {
        userId: 'user-1',
        roles: ['mentee', 'mentor'],
        previousRoles: ['mentee'],
        reason: 'granted',
      },
    ]);
  });

  it('removes a role, preserves the others, and bumps session_version', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentee', 'mentor'], sessionVersion: 0 }));

    const result = await makeService().revokeRole('user-1', 'mentor');

    expect(result.user.roles).toEqual(['mentee']);
    expect(result.sessionVersion).toBe(1);
    expect(rolesChangedEvents()).toEqual([
      {
        userId: 'user-1',
        roles: ['mentee'],
        previousRoles: ['mentee', 'mentor'],
        reason: 'revoked',
      },
    ]);
  });

  it('normalizes the written set, so a duplicate grant cannot accumulate', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentor', 'mentee', 'mentor'] }));

    const result = await makeService().grantRole('user-1', 'operator');

    expect(result.user.roles).toEqual(['mentee', 'mentor', 'operator']);
    expect(db.rows[0]?.roles).toEqual(['mentee', 'mentor', 'operator']);
  });

  it('is a no-op when the role is already held, and does not sign the user out', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentee', 'mentor'], sessionVersion: 2 }));

    const result = await makeService().grantRole('user-1', 'mentor');

    expect(result.sessionVersion).toBe(2);
    expect(rolesChangedEvents()).toEqual([]);
  });

  it('is a no-op when the role is already absent', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentee'], sessionVersion: 2 }));

    const result = await makeService().revokeRole('user-1', 'mentor');

    expect(result.sessionVersion).toBe(2);
    expect(rolesChangedEvents()).toEqual([]);
  });

  it('refuses to revoke the last role a user holds', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentee'] }));

    await expect(makeService().revokeRole('user-1', 'mentee')).rejects.toThrow(ConflictError);
    expect(db.rows[0]?.roles).toEqual(['mentee']);
  });

  it('reports an unknown user as not found', async () => {
    await expect(makeService().grantRole('missing', 'mentor')).rejects.toThrow(NotFoundError);
  });

  it('does not consult the allowlist: the stored operator role is only a cache', async () => {
    // `grantRole` is not how a founder is made. The write lands, but `resolveLiveRoles`
    // strips it again on the next request, which is what D19 requires.
    db.rows.push(row({ id: 'user-1', roles: ['mentee'] }));

    const result = await makeService([]).grantRole('user-1', 'operator');

    expect(result.user.roles).toEqual(['mentee', 'operator']);
  });
});

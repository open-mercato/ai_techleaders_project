import { UniqueConstraintViolationException, type EntityManager, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env';
import { EventBus } from '../../events/event-bus';
import type { EventMap } from '../../events/event-map';
import type { Session } from '../../http/auth';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../http/errors';
import {
  rateLimitKey,
  REGISTRATION_IP_POLICY,
  SIGN_IN_EMAIL_POLICY,
  SIGN_IN_IP_POLICY,
  type RateLimiter,
  type RateLimitPolicy,
} from '../../http/rate-limit';
import type { Logger } from '../../logger';
import type { Clock } from '../../time/clock';
import type { EmailVerificationService } from './email-verification.service';
import type { PasswordService, PasswordWork } from './password.service';
import {
  ACCOUNT_EXISTS_MESSAGE,
  EMAIL_NOT_VERIFIED_MESSAGE,
  GITHUB_ACCOUNT_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  UserService,
  type AuthenticateWithPasswordInput,
  type GithubIdentityInput,
  type RegisterWithPasswordInput,
  type UserCreateInput,
} from './user.service';

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
  passwordHash: string | null;
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
    passwordHash: null,
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
  /** Every `clear`, so the registration-race recovery is observable. */
  clears = 0;
  /** Every single-row lookup, so "refused before the table was touched" is observable. */
  reads = 0;
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
        this.reads += 1;
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
      // The only state this fake's unit of work has is `pending`, so dropping it is the
      // whole of `clear()` — and it is exactly what the registration-race recovery needs:
      // without it the losing INSERT is still queued and the retry's flush loses again.
      clear: (): void => {
        this.clears += 1;
        pending = [];
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

/**
 * One ordered log of every step the credential path takes, shared by the three fakes.
 *
 * The ordering *is* the requirement (B8, edge case 18): gate slot, then rate limit, then
 * hash. Asserting it needs one timeline across three collaborators, so they all append to
 * this rather than each recording its own call count.
 */
let steps: string[];

/**
 * `PasswordService`'s seam, not the real thing: the real one runs scrypt at N=2¹⁷, which is
 * 128 MiB and ~100 ms per call — a per-test cost with nothing to prove here, since
 * `password.service.test.ts` already covers the algorithm and the gate. What is reproduced
 * exactly is the two properties `UserService` composes against: `withSlot` rejects **before**
 * running its callback when the gate is saturated, and `verify` answers false immediately for
 * a null stored hash.
 */
class FakePasswords {
  /** When set, `withSlot` refuses like a saturated gate: no callback, no rate-limit call. */
  saturated = false;
  hashes = 0;
  verifications: Array<{ plaintext: string; storedHash: string | null }> = [];

  private readonly work: PasswordWork = {
    hash: (plaintext) => {
      steps.push('hash');
      this.hashes += 1;
      return Promise.resolve(`scrypt:${plaintext}`);
    },
    verify: (plaintext, storedHash) => {
      steps.push('verify');
      this.verifications.push({ plaintext, storedHash });
      // The real service's contract: a null stored hash never verifies, and never spends
      // the time a real comparison would.
      return Promise.resolve(storedHash !== null && storedHash === `scrypt:${plaintext}`);
    },
  };

  async withSlot<T>(run: (work: PasswordWork) => Promise<T>): Promise<T> {
    steps.push('gate');
    if (this.saturated) {
      throw new ServiceUnavailableError('The server is briefly at capacity.');
    }
    return run(this.work);
  }

  asService(): PasswordService {
    return this as unknown as PasswordService;
  }
}

/** `RateLimiter`'s seam: records what was charged, and can refuse. */
class FakeRateLimiter {
  charged: Array<{ key: string | null; policy: RateLimitPolicy }> = [];
  /** Queued refusals, one per `consume`, standing in for a spent bucket. */
  refusals: Array<TooManyRequestsError | null> = [];

  consume(key: string | null, policy: RateLimitPolicy): Promise<void> {
    steps.push('limit');
    this.charged.push({ key, policy });
    const refusal = this.refusals.shift();
    return refusal ? Promise.reject(refusal) : Promise.resolve();
  }

  asService(): RateLimiter {
    return this as unknown as RateLimiter;
  }
}

/** `EmailVerificationService`'s seam: records the send, and can fail delivery. */
class FakeVerificationMail {
  sent: Array<{ userId: string; email: string; returnTo?: string | null }> = [];
  failure: unknown = null;

  sendVerificationLink({
    user,
    returnTo,
  }: {
    user: { id: string; email: string };
    returnTo?: string | null;
  }): Promise<void> {
    steps.push('mail');
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    this.sent.push({ userId: user.id, email: user.email, returnTo });
    return Promise.resolve();
  }

  asService(): EmailVerificationService {
    return this as unknown as EmailVerificationService;
  }
}

let db: FakeDb;
let eventBus: EventBus;
let emitted: Array<{ id: string; payload: unknown }>;
let passwords: FakePasswords;
let limiter: FakeRateLimiter;
let mail: FakeVerificationMail;

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
    passwordService: passwords.asService(),
    rateLimiter: limiter.asService(),
    emailVerificationService: mail.asService(),
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
  steps = [];
  passwords = new FakePasswords();
  limiter = new FakeRateLimiter();
  mail = new FakeVerificationMail();
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
      passwordHash: 'whatever-mallory-liked',
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
        // `create` is the passwordless path and says so by name: only
        // `registerWithPassword` writes this column, and only from a hash it produced.
        passwordHash: null,
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

describe('endAllSessions', () => {
  it('bumps session_version, ending every session the user holds', async () => {
    db.rows.push(row({ id: 'user-1', sessionVersion: 7 }));

    await expect(makeService().endAllSessions('user-1')).resolves.toBeUndefined();

    expect(db.rows[0]?.sessionVersion).toBe(8);
  });

  it('leaves the role set and every other column alone', async () => {
    db.rows.push(row({ id: 'user-1', roles: ['mentee', 'operator'], sessionVersion: 0 }));

    await makeService(['ada@devmentor.dev']).endAllSessions('user-1');

    // Sign-out is not a reconciliation: it revokes tokens and says nothing about roles.
    expect(db.rows[0]?.roles).toEqual(['mentee', 'operator']);
    expect(db.rows[0]?.email).toBe('ada@devmentor.dev');
    expect(emitted).toEqual([]);
  });

  it('touches no other user', async () => {
    db.rows.push(row({ id: 'user-1', sessionVersion: 1 }));
    db.rows.push(row({ id: 'user-2', email: 'grace@devmentor.dev', sessionVersion: 1 }));

    await makeService().endAllSessions('user-1');

    expect(db.rows[1]?.sessionVersion).toBe(1);
  });

  it('does nothing, and does not throw, when the row has since been deleted', async () => {
    // The session was resolved from a `findOne` a moment ago, so this is the narrow window
    // where the account was deleted in between. The caller's cookie is expired regardless.
    await expect(makeService().endAllSessions('missing')).resolves.toBeUndefined();

    expect(db.rows).toEqual([]);
  });

  it('is safe to run twice concurrently: every old token still stops verifying', async () => {
    db.rows.push(row({ id: 'user-1', sessionVersion: 4 }));

    await Promise.all([
      makeService().endAllSessions('user-1'),
      makeService().endAllSessions('user-1'),
    ]);

    // Both may read 4 and both may write 5. What has to hold is that nothing carrying 4
    // verifies any more, not that the counter reached 6.
    expect(db.rows[0]?.sessionVersion).toBeGreaterThan(4);
  });
});

const REGISTRATION: RegisterWithPasswordInput = {
  email: 'grace@devmentor.dev',
  password: 'correct horse battery',
  displayName: 'Grace Hopper',
  returnTo: '/mentors',
  clientIp: '203.0.113.7',
};

const SIGN_IN: AuthenticateWithPasswordInput = {
  email: 'ada@devmentor.dev',
  password: 'correct horse battery',
  clientIp: '203.0.113.7',
};

/** The hash `FakePasswords` produces for a plaintext, as a stored column value would hold. */
function storedHashOf(plaintext: string): string {
  return `scrypt:${plaintext}`;
}

/**
 * The `AppError` a call was refused with, so two refusals can be compared field by field.
 *
 * `rejects.toThrow` compares a message; the property under test is that two refusals are
 * the *same* message, which needs both errors in hand at once.
 */
async function refusalFrom(pending: Promise<unknown>): Promise<AppError> {
  try {
    await pending;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected the call to be refused, but it resolved');
}

describe('registerWithPassword — the state matrix', () => {
  it('row 1, no existing row: creates an unverified mentee, writes the hash, and mails a link', async () => {
    const outcome = await makeService().registerWithPassword(REGISTRATION);

    expect(outcome).toEqual({ email: 'grace@devmentor.dev' });
    expect(db.rows).toEqual([
      expect.objectContaining({
        email: 'grace@devmentor.dev',
        displayName: 'Grace Hopper',
        roles: ['mentee'],
        // The whole reason the hash may be written immediately: this column is what gates
        // sign-in, and registration never sets it.
        emailVerifiedAt: null,
        passwordHash: storedHashOf(REGISTRATION.password),
        githubId: null,
        sessionVersion: 0,
      }),
    ]);
    expect(mail.sent).toEqual([
      { userId: db.rows[0]?.id, email: 'grace@devmentor.dev', returnTo: '/mentors' },
    ]);
    expect(emitted).toEqual([
      { id: 'auth.user.created', payload: { userId: db.rows[0]?.id, email: 'grace@devmentor.dev' } },
    ]);
  });

  it('row 2, verified with a password: refuses with the generic conflict', async () => {
    db.rows.push(
      row({ id: 'user-1', email: REGISTRATION.email, passwordHash: storedHashOf('other') }),
    );

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      new ConflictError(ACCOUNT_EXISTS_MESSAGE),
    );
    // Nothing was written, nothing was mailed, and no scrypt run was spent on a refusal.
    expect(db.rows[0]?.passwordHash).toBe(storedHashOf('other'));
    expect(mail.sent).toEqual([]);
    expect(passwords.hashes).toBe(0);
    expect(emitted).toEqual([]);
  });

  it('row 3, verified GitHub-only account: points the user at GitHub sign-in', async () => {
    // Edge case 14, and the spec's one recorded deviation from the generic-auth rule.
    db.rows.push(
      row({ id: 'user-1', email: REGISTRATION.email, githubId: '4242', passwordHash: null }),
    );

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      new ConflictError(GITHUB_ACCOUNT_MESSAGE),
    );
    expect(db.rows[0]?.passwordHash).toBeNull();
    expect(mail.sent).toEqual([]);
  });

  it('refuses generically when a verified row holds both a password and a GitHub identity', async () => {
    // Linked, not GitHub-only: this account can be signed into with a password, so naming
    // GitHub would widen the oracle without changing what the user should do.
    db.rows.push(
      row({
        id: 'user-1',
        email: REGISTRATION.email,
        githubId: '4242',
        passwordHash: storedHashOf('other'),
      }),
    );

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      new ConflictError(ACCOUNT_EXISTS_MESSAGE),
    );
  });

  it('refuses generically when a verified row holds neither credential', async () => {
    // Not in the matrix because it should not exist. It is still somebody's account, and
    // this is not the method that repairs it.
    db.rows.push(
      row({ id: 'user-1', email: REGISTRATION.email, githubId: null, passwordHash: null }),
    );

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      new ConflictError(ACCOUNT_EXISTS_MESSAGE),
    );
  });

  it('row 4, unverified with no password: claims the row and mails a link', async () => {
    db.rows.push(
      row({
        id: 'user-1',
        email: REGISTRATION.email,
        emailVerifiedAt: null,
        passwordHash: null,
      }),
    );

    const outcome = await makeService().registerWithPassword(REGISTRATION);

    expect(outcome).toEqual({ email: REGISTRATION.email });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.passwordHash).toBe(storedHashOf(REGISTRATION.password));
    expect(db.rows[0]?.emailVerifiedAt).toBeNull();
    expect(mail.sent).toEqual([
      { userId: 'user-1', email: REGISTRATION.email, returnTo: '/mentors' },
    ]);
    // A claim is not a creation: no second row and no second announcement.
    expect(emitted).toEqual([]);
  });

  it('row 5, unverified with a password: overwrites the hash and mails a link', async () => {
    // The case that looks like account takeover and is not: `email_verified_at` is still
    // null afterwards, so the row cannot be signed in as by anybody — including the writer.
    db.rows.push(
      row({
        id: 'user-1',
        email: REGISTRATION.email,
        emailVerifiedAt: null,
        passwordHash: storedHashOf('the first registrant’s password'),
      }),
    );

    await makeService().registerWithPassword(REGISTRATION);

    expect(db.rows[0]?.passwordHash).toBe(storedHashOf(REGISTRATION.password));
    expect(db.rows[0]?.emailVerifiedAt).toBeNull();
    expect(mail.sent).toHaveLength(1);
  });

  it('never rewrites the display name of a row it claims', async () => {
    // The address is unproven, so an unauthenticated request must not be able to change a
    // field other people are shown.
    db.rows.push(
      row({
        id: 'user-1',
        email: REGISTRATION.email,
        displayName: 'Grace H.',
        emailVerifiedAt: null,
      }),
    );

    await makeService().registerWithPassword({ ...REGISTRATION, displayName: 'Mallory' });

    expect(db.rows[0]?.displayName).toBe('Grace H.');
  });

  it('cannot set roles or any other privileged column, whatever the caller passes', async () => {
    const widened = {
      ...REGISTRATION,
      roles: ['operator'],
      sessionVersion: 99,
      githubId: '4242',
      emailVerifiedAt: NOW,
    } as unknown as RegisterWithPasswordInput;

    await makeService().registerWithPassword(widened);

    expect(db.rows[0]).toMatchObject({
      roles: ['mentee'],
      sessionVersion: 0,
      githubId: null,
      emailVerifiedAt: null,
    });
  });

  it('forwards a missing returnTo as-is rather than inventing one', async () => {
    await makeService().registerWithPassword({ ...REGISTRATION, returnTo: undefined });

    expect(mail.sent[0]?.returnTo).toBeUndefined();
  });
});

describe('registerWithPassword — no session, and delivery', () => {
  it('issues no session for a brand-new registration', async () => {
    const outcome = await makeService().registerWithPassword(REGISTRATION);

    // The whole answer is the address. Nothing a route could sign a cookie from.
    expect(Object.keys(outcome)).toEqual(['email']);
  });

  it('issues no session when it claims an unverified row, and one only after verification', async () => {
    db.rows.push(
      row({
        id: 'user-1',
        email: SIGN_IN.email,
        emailVerifiedAt: null,
        passwordHash: null,
      }),
    );
    const service = makeService();

    const outcome = await service.registerWithPassword({
      ...REGISTRATION,
      email: SIGN_IN.email,
    });

    expect(Object.keys(outcome)).toEqual(['email']);
    // Proving it the way a caller would: the claimed credential does not open the account.
    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      EMAIL_NOT_VERIFIED_MESSAGE,
    );

    // ...until whoever received the mail opens the link, which is the only thing that sets
    // this column (`EmailVerificationService.verify`).
    const claimed = db.rows[0];
    if (claimed) {
      claimed.emailVerifiedAt = NOW;
    }

    await expect(makeService().authenticateWithPassword(SIGN_IN)).resolves.toMatchObject({
      user: { id: 'user-1' },
      sessionVersion: 0,
    });
  });

  it('fails closed when delivery fails, reporting no success', async () => {
    // Edge case 29. `sendVerificationLink` rejects and nothing here catches it.
    mail.failure = new ServiceUnavailableError('mail provider timed out');

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  it('leaves a claimable unverified row behind when delivery fails, so a retry recovers', async () => {
    mail.failure = new ServiceUnavailableError('mail provider timed out');
    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      ServiceUnavailableError,
    );

    // The row exists with a hash and no `email_verified_at` — matrix row five, which grants
    // nobody anything. Registering again claims it and sends a fresh link.
    expect(db.rows[0]).toMatchObject({
      emailVerifiedAt: null,
      passwordHash: storedHashOf(REGISTRATION.password),
    });

    mail.failure = null;
    await expect(makeService().registerWithPassword(REGISTRATION)).resolves.toEqual({
      email: REGISTRATION.email,
    });
    expect(db.rows).toHaveLength(1);
  });
});

describe('registerWithPassword — gate, limit and hash ordering', () => {
  it('acquires the gate slot, consumes the rate limit, then hashes, then mails', async () => {
    await makeService().registerWithPassword(REGISTRATION);

    // Primitives B8, restated in the Data Model. The order is the requirement.
    expect(steps).toEqual(['gate', 'limit', 'hash', 'mail']);
  });

  it('charges the per-IP registration bucket under the registration policy', async () => {
    await makeService().registerWithPassword(REGISTRATION);

    expect(limiter.charged).toEqual([
      { key: rateLimitKey('register', 'ip', REGISTRATION.clientIp), policy: REGISTRATION_IP_POLICY },
    ]);
    // The key is a digest, so no address of any kind reaches the counter table.
    expect(limiter.charged[0]?.key).not.toContain(REGISTRATION.clientIp);
  });

  it('skips the per-IP bucket when no client IP could be derived', async () => {
    // Edge case 17b, handled by `consume`'s null-key contract rather than an `if` here.
    await makeService().registerWithPassword({ ...REGISTRATION, clientIp: null });

    expect(limiter.charged).toEqual([{ key: null, policy: REGISTRATION_IP_POLICY }]);
    expect(db.rows).toHaveLength(1);
  });

  it('does not charge the rate limiter when the hashing gate is saturated', async () => {
    // Edge case 18. `withSlot` rejects before it runs its callback, so the 503 costs the
    // caller no attempt — an unrelated burst must not lock out the merely unlucky.
    passwords.saturated = true;

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      ServiceUnavailableError,
    );

    expect(steps).toEqual(['gate']);
    expect(limiter.charged).toEqual([]);
    expect(db.reads).toBe(0);
    expect(db.rows).toEqual([]);
  });

  it('refuses a spent bucket with 429 before reading a row or hashing', async () => {
    limiter.refusals = [new TooManyRequestsError(42)];

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      TooManyRequestsError,
    );

    expect(steps).toEqual(['gate', 'limit']);
    expect(db.reads).toBe(0);
    expect(passwords.hashes).toBe(0);
    expect(db.rows).toEqual([]);
  });

  it('charges the attempt even when the matrix refuses it', async () => {
    // The 409 is a recorded oracle; an oracle that answered for free would be an
    // enumeration API, so the counter is consumed before the lookup that produces it.
    db.rows.push(row({ id: 'user-1', email: REGISTRATION.email, passwordHash: 'x' }));

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(ConflictError);

    expect(limiter.charged).toHaveLength(1);
  });
});

describe('registerWithPassword — the insert race', () => {
  it('claims the winner after losing on users_email_unique', async () => {
    // Two registrations for the same brand-new address; a double-submitted form is enough.
    db.flushFailures = [uniqueViolation('users_email_unique')];
    const service = makeService();

    const pending = service.registerWithPassword(REGISTRATION);
    // The winner commits while our insert is in flight: an unverified row with a hash,
    // which is matrix row five and therefore claimable.
    db.rows.push(
      row({
        id: 'user-winner',
        email: REGISTRATION.email,
        emailVerifiedAt: null,
        passwordHash: storedHashOf('the winner’s password'),
      }),
    );

    await expect(pending).resolves.toEqual({ email: REGISTRATION.email });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.passwordHash).toBe(storedHashOf(REGISTRATION.password));
    expect(db.clears).toBe(1);
    // One scrypt run, reused across the retry: the recovery must not double the cost of the
    // exact contention the gate is sized to survive.
    expect(passwords.hashes).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it('applies the matrix to the row it re-reads, rather than claiming it blindly', async () => {
    db.flushFailures = [uniqueViolation('users_email_unique')];
    const service = makeService();

    const pending = service.registerWithPassword(REGISTRATION);
    // The winner here is a verified GitHub sign-in, not a registration.
    db.rows.push(
      row({ id: 'user-winner', email: REGISTRATION.email, githubId: '4242', passwordHash: null }),
    );

    await expect(pending).rejects.toThrow(new ConflictError(GITHUB_ACCOUNT_MESSAGE));
    expect(mail.sent).toEqual([]);
  });

  it('inserts again when the winner has vanished by the time it re-reads', async () => {
    db.flushFailures = [uniqueViolation('users_email_unique')];

    await expect(makeService().registerWithPassword(REGISTRATION)).resolves.toEqual({
      email: REGISTRATION.email,
    });
    expect(db.rows).toHaveLength(1);
  });

  it('rethrows a unique violation on an unrelated constraint instead of retrying', async () => {
    db.flushFailures = [uniqueViolation('users_github_id_unique')];

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      /users_github_id_unique/,
    );
    expect(db.clears).toBe(0);
  });

  it('rethrows a failure that is not a lost race at all', async () => {
    db.flushFailures = [new Error('connection terminated')];

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      'connection terminated',
    );
    expect(db.clears).toBe(0);
    expect(mail.sent).toEqual([]);
  });

  it('does not retry twice: a second loss is a defect, not contention', async () => {
    db.flushFailures = [
      uniqueViolation('users_email_unique'),
      uniqueViolation('users_email_unique'),
    ];

    await expect(makeService().registerWithPassword(REGISTRATION)).rejects.toThrow(
      /users_email_unique/,
    );
    expect(db.clears).toBe(1);
  });
});

describe('authenticateWithPassword', () => {
  function verifiedAccount(overrides: Partial<Row> = {}): Row {
    return row({
      id: 'user-1',
      email: SIGN_IN.email,
      emailVerifiedAt: EARLIER,
      passwordHash: storedHashOf(SIGN_IN.password),
      ...overrides,
    });
  }

  it('signs in a verified account with the right password', async () => {
    db.rows.push(
      verifiedAccount({
        sessionVersion: 3,
        githubLogin: 'ada',
        mentorProfile: { id: 'profile-1', headline: 'Analytical engines' },
      }),
    );

    await expect(makeService().authenticateWithPassword(SIGN_IN)).resolves.toEqual({
      user: {
        id: 'user-1',
        email: SIGN_IN.email,
        displayName: 'Ada Lovelace',
        roles: ['mentee'],
        githubLogin: 'ada',
        avatarUrl: null,
        createdAt: EARLIER.toISOString(),
        mentorProfile: { id: 'profile-1', headline: 'Analytical engines' },
      },
      sessionVersion: 3,
    });
  });

  it('refuses an unknown email address', async () => {
    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('refuses a wrong password', async () => {
    db.rows.push(verifiedAccount());

    await expect(
      makeService().authenticateWithPassword({ ...SIGN_IN, password: 'not the one' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('refuses a GitHub-only account with the same generic message', async () => {
    // A row with `github_id` set and `password_hash` null. Login stays strictly generic:
    // the pointed message belongs to the register path and nowhere else.
    db.rows.push(verifiedAccount({ githubId: '4242', passwordHash: null }));

    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it('gives byte-identical messages for an unknown email and a wrong password', async () => {
    // Edge case 13, asserted as the property the spec states rather than as two literals
    // that happen to read alike today.
    const unknown = await refusalFrom(makeService().authenticateWithPassword(SIGN_IN));

    db.rows.push(verifiedAccount());
    const wrongPassword = await refusalFrom(
      makeService().authenticateWithPassword({ ...SIGN_IN, password: 'not the one' }),
    );

    expect(unknown.message).toBe(wrongPassword.message);
    expect(unknown.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect([unknown.status, unknown.code]).toEqual([wrongPassword.status, wrongPassword.code]);
    expect([unknown.status, unknown.code]).toEqual([401, 'unauthorized']);
  });

  it('runs the credential check even for an unknown address, so there is one refusal site', async () => {
    // `verify` answers false immediately for a null stored hash — deliberately, because a
    // decoy hash would cost a gate slot and 128 MiB per probe (see `password.service.ts`).
    // Calling it anyway is what keeps unknown-address, no-password and wrong-password on one
    // code path with one message. The residual timing difference is the recorded trade; what
    // bounds enumeration is the two counters charged above.
    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      INVALID_CREDENTIALS_MESSAGE,
    );

    expect(passwords.verifications).toEqual([
      { plaintext: SIGN_IN.password, storedHash: null },
    ]);
  });

  it('logs no address, id or reason code when it refuses', async () => {
    db.rows.push(verifiedAccount());

    await expect(
      makeService().authenticateWithPassword({ ...SIGN_IN, password: 'not the one' }),
    ).rejects.toThrow(UnauthorizedError);

    // The log line must not be the oracle the response refuses to be.
    expect(logger.info).toHaveBeenCalledWith('refused a password sign-in');
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).not.toContain(SIGN_IN.email);
    expect(logged).not.toContain('not the one');
  });

  it('refuses to sign in before the address is confirmed, and says why', async () => {
    // Edge case 15. Specific on purpose: only somebody who already holds the password can
    // see this, so it partitions no failed credential check.
    db.rows.push(verifiedAccount({ emailVerifiedAt: null }));

    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      new UnauthorizedError(EMAIL_NOT_VERIFIED_MESSAGE),
    );
  });

  it('gives an unverified row the generic refusal when the password is wrong', async () => {
    // The ordering that keeps the specific message from becoming an enumeration oracle: the
    // credential is checked first, so a guesser never learns the address exists.
    db.rows.push(verifiedAccount({ emailVerifiedAt: null }));

    await expect(
      makeService().authenticateWithPassword({ ...SIGN_IN, password: 'not the one' }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE);
  });

  it('reads the stored role set without reconciling it against the allowlist', async () => {
    // The same choice `EmailVerificationService.verify` makes: a landing page is a
    // convenience, and `requireSession` derives `operator` live on the next request.
    db.rows.push(verifiedAccount({ roles: ['operator', 'mentee', 'mentee'] }));

    const { user } = await makeService([]).authenticateWithPassword(SIGN_IN);

    // Canonical and duplicate-free, but not re-derived: no demotion, no write, no event.
    expect(user.roles).toEqual(['mentee', 'operator']);
    expect(db.rows[0]?.roles).toEqual(['operator', 'mentee', 'mentee']);
    expect(emitted).toEqual([]);
  });
});

describe('authenticateWithPassword — gate, limit and hash ordering', () => {
  it('acquires the gate slot, consumes both buckets, then verifies', async () => {
    db.rows.push(
      row({
        id: 'user-1',
        email: SIGN_IN.email,
        passwordHash: storedHashOf(SIGN_IN.password),
      }),
    );

    await makeService().authenticateWithPassword(SIGN_IN);

    expect(steps).toEqual(['gate', 'limit', 'limit', 'verify']);
  });

  it('charges independent per-IP and per-email buckets, each under its own policy', async () => {
    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      UnauthorizedError,
    );

    expect(limiter.charged).toEqual([
      { key: rateLimitKey('sign-in', 'ip', SIGN_IN.clientIp), policy: SIGN_IN_IP_POLICY },
      { key: rateLimitKey('sign-in', 'email', SIGN_IN.email), policy: SIGN_IN_EMAIL_POLICY },
    ]);
    const keys = limiter.charged.map((entry) => entry.key);
    expect(keys[0]).not.toBe(keys[1]);
    // Digests, so neither the address nor the IP reaches the counter table.
    expect(JSON.stringify(keys)).not.toContain(SIGN_IN.email);
    expect(JSON.stringify(keys)).not.toContain(SIGN_IN.clientIp);
  });

  it('keeps the per-email bucket when no client IP could be derived', async () => {
    // Edge case 17b: per-IP limiting degrades to off, per-email limiting still applies.
    await expect(
      makeService().authenticateWithPassword({ ...SIGN_IN, clientIp: null }),
    ).rejects.toThrow(UnauthorizedError);

    expect(limiter.charged).toEqual([
      { key: null, policy: SIGN_IN_IP_POLICY },
      { key: rateLimitKey('sign-in', 'email', SIGN_IN.email), policy: SIGN_IN_EMAIL_POLICY },
    ]);
  });

  it('does not charge either bucket when the hashing gate is saturated', async () => {
    // Edge case 18, on the route an attacker can hit at will.
    passwords.saturated = true;

    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      ServiceUnavailableError,
    );

    expect(steps).toEqual(['gate']);
    expect(limiter.charged).toEqual([]);
    expect(db.reads).toBe(0);
  });

  it('refuses a spent bucket with 429 before touching a credential', async () => {
    db.rows.push(row({ id: 'user-1', email: SIGN_IN.email }));
    limiter.refusals = [null, new TooManyRequestsError(300)];

    await expect(makeService().authenticateWithPassword(SIGN_IN)).rejects.toThrow(
      TooManyRequestsError,
    );

    expect(steps).toEqual(['gate', 'limit', 'limit']);
    expect(db.reads).toBe(0);
    expect(passwords.verifications).toEqual([]);
  });

  it('charges the attempt whether or not it succeeds', async () => {
    // The counter never decrements and a success never refunds: a refund would make the
    // count depend on whether the password was right, which is an oracle in itself.
    db.rows.push(
      row({
        id: 'user-1',
        email: SIGN_IN.email,
        passwordHash: storedHashOf(SIGN_IN.password),
      }),
    );

    await makeService().authenticateWithPassword(SIGN_IN);

    expect(limiter.charged).toHaveLength(2);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { SessionService } from '../services/auth/session.service';
import type { Clock } from '../time/clock';
import {
  assertOwnership,
  CSRF_HEADER,
  requireCsrfHeader,
  requireRole,
  requireSession,
  resolveSessionFromCookie,
  type Session,
} from './auth';
import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * The session guard is tested against a **real** `SessionService`, not a stub that returns
 * claims on demand. Expiry, tampering and the audience check are properties of the real
 * signature verification, and a stub asked to "return null for the expired case" would only
 * assert that the test knows which case it set up. Everything the guard itself owns — the
 * row reload, the `session_version` comparison, the live operator derivation and the
 * non-empty role invariant — is exercised through that real verification path.
 */

const SECRET = 'a'.repeat(32);
const START = new Date('2026-09-09T10:00:00.000Z');

/** Mutable so a case can move past the 24 h boundary without sleeping. */
let now: Date;
const clock: Clock = { now: () => now };

function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: 'test',
    SESSION_SECRET: SECRET,
    OPERATOR_EMAILS: [],
    ...overrides,
  } as unknown as AppEnv;
}

type StoredUser = {
  id: string;
  email: string;
  roles: string[];
  emailVerifiedAt: Date | null;
  sessionVersion: number;
};

function user(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: 'user-1',
    email: 'ada@devmentor.dev',
    roles: ['mentee'],
    emailVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
    sessionVersion: 0,
    ...overrides,
  };
}

/** The row `em.findOne` answers with, or `null` for "no such user". */
let storedUser: StoredUser | null;
let findOne: ReturnType<typeof vi.fn>;
let sessionService: SessionService;

function cradle(overrides: Partial<Cradle> = {}): Cradle {
  return {
    env: env(),
    sessionService,
    em: { findOne },
    sessionCookie: null,
    session: Promise.resolve(null),
    ...overrides,
  } as unknown as Cradle;
}

/** The raw token out of a freshly issued `Set-Cookie` value. */
async function issueToken(overrides: Partial<StoredUser> = {}): Promise<string> {
  const row = user(overrides);
  const { cookie } = await sessionService.issue({
    id: row.id,
    sessionVersion: row.sessionVersion,
  });
  return cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
}

function requestWith(cookieHeader: string | null, method = 'GET'): Request {
  return new Request('http://devmentor.test/api/users', {
    method,
    ...(cookieHeader === null ? {} : { headers: { cookie: cookieHeader } }),
  });
}

beforeEach(() => {
  now = START;
  storedUser = user();
  findOne = vi.fn(async () => storedUser);
  sessionService = new SessionService({ env: env(), clock });
});

describe('resolveSessionFromCookie', () => {
  it('answers null for no cookie at all, without touching the database', async () => {
    await expect(resolveSessionFromCookie(null, cradle())).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('answers null for a cookie value that is not a token we issued', async () => {
    await expect(resolveSessionFromCookie('not-a-jwt', cradle())).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('resolves a valid cookie to the stored identity', async () => {
    const token = await issueToken();

    await expect(resolveSessionFromCookie(token, cradle())).resolves.toEqual({
      userId: 'user-1',
      roles: ['mentee'],
    });
    expect(findOne).toHaveBeenCalledOnce();
  });

  it('answers null for an expired cookie', async () => {
    // Edge case 10: the browser is redirected to sign-in; nothing of the user's is
    // rendered first, so this must not arrive as an exception.
    const token = await issueToken();
    now = new Date(START.getTime() + 25 * 60 * 60 * 1000);

    await expect(resolveSessionFromCookie(token, cradle())).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('answers null for a tampered cookie', async () => {
    const token = await issueToken();
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'someone-else', sv: 0, aud: 'session' }),
    ).toString('base64url');

    await expect(
      resolveSessionFromCookie(`${header}.${forgedPayload}.${signature}`, cradle()),
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('answers null when the user the cookie names no longer exists', async () => {
    const token = await issueToken();
    storedUser = null;

    await expect(resolveSessionFromCookie(token, cradle())).resolves.toBeNull();
  });

  it('answers null when the stored session version has moved on', async () => {
    // Edge case 11: sign-out bumped the column, so a copied cookie dies on its next
    // guarded request.
    const token = await issueToken({ sessionVersion: 3 });
    storedUser = user({ sessionVersion: 4 });

    await expect(resolveSessionFromCookie(token, cradle())).resolves.toBeNull();
  });

  it('returns the stored roles rather than anything carried in the token', async () => {
    const token = await issueToken();
    storedUser = user({ roles: ['mentee', 'mentor'] });

    await expect(resolveSessionFromCookie(token, cradle())).resolves.toEqual({
      userId: 'user-1',
      roles: ['mentee', 'mentor'],
    });
  });

  it('grants operator live to an allowlisted address whose stored set lacks it', async () => {
    // Edge case 25 through the guard: added to `OPERATOR_EMAILS`, effective next request.
    const token = await issueToken();
    storedUser = user({ roles: ['mentee', 'mentor'] });

    const session = await resolveSessionFromCookie(
      token,
      cradle({ env: env({ OPERATOR_EMAILS: ['ada@devmentor.dev'] }) }),
    );

    expect(session).toEqual({ userId: 'user-1', roles: ['mentee', 'mentor', 'operator'] });
  });

  it('revokes a stored operator role the moment the address leaves the allowlist', async () => {
    // Edge case 24, and the reason a role copy in the token was rejected outright.
    const token = await issueToken();
    storedUser = user({ roles: ['mentee', 'operator'] });

    const session = await resolveSessionFromCookie(
      token,
      cradle({ env: env({ OPERATOR_EMAILS: ['founder@devmentor.dev'] }) }),
    );

    expect(session).toEqual({ userId: 'user-1', roles: ['mentee'] });
  });

  it('does not write the reconciled role set back to the row', async () => {
    // Persisting the cache, emitting `auth.user.roles_changed` and the grant/revoke
    // operations all belong to `UserService`. The guard derives and nothing else.
    const token = await issueToken();
    storedUser = user({ roles: ['mentee', 'operator'] });

    await resolveSessionFromCookie(token, cradle());

    expect(storedUser.roles).toEqual(['mentee', 'operator']);
  });

  it('throws an internal error, not a 401, for an empty stored role set', async () => {
    // Edge case 30b. A 401 would loop a valid user through sign-in and hide the data bug.
    const token = await issueToken();
    storedUser = user({ roles: [] });

    const failure = resolveSessionFromCookie(token, cradle());

    await expect(failure).rejects.toThrow(/User user-1 has no roles/);
    await expect(failure).rejects.not.toBeInstanceOf(UnauthorizedError);
  });

  it('reports the empty stored set even when the address is allowlisted', async () => {
    // The live derivation would otherwise paper over the corruption by adding `operator`.
    const token = await issueToken();
    storedUser = user({ roles: [] });

    await expect(
      resolveSessionFromCookie(
        token,
        cradle({ env: env({ OPERATOR_EMAILS: ['ada@devmentor.dev'] }) }),
      ),
    ).rejects.toThrow(/has no roles/);
  });

  it('throws an internal error when revocation leaves no role at all', async () => {
    // A row holding only the operator cache is corrupt in the same way: D19 grants
    // operator on top of a base role, never instead of one.
    const token = await issueToken();
    storedUser = user({ roles: ['operator'] });

    await expect(resolveSessionFromCookie(token, cradle())).rejects.toThrow(
      /has no roles/,
    );
  });
});

describe('requireSession', () => {
  it('returns the session a valid cookie resolves to', async () => {
    const token = await issueToken();

    const session = await requireSession(
      requestWith(`devmentor_session=${token}`),
      cradle(),
    );

    expect(session).toEqual({ userId: 'user-1', roles: ['mentee'] });
  });

  it('reads the session cookie past unrelated cookies on the same header', async () => {
    const token = await issueToken();

    const session = await requireSession(
      requestWith(`theme=dark; devmentor_session=${token}; consent=1`),
      cradle(),
    );

    expect(session).toEqual({ userId: 'user-1', roles: ['mentee'] });
  });

  it('throws 401 when the request carries no cookie header', async () => {
    await expect(requireSession(requestWith(null), cradle())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(findOne).not.toHaveBeenCalled();
  });

  it('throws 401 when other cookies are present but the session one is not', async () => {
    await expect(
      requireSession(requestWith('theme=dark; consent=1'), cradle()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('throws 401 when the named user is gone', async () => {
    const token = await issueToken();
    storedUser = null;

    await expect(
      requireSession(requestWith(`devmentor_session=${token}`), cradle()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws 401 on a session version mismatch', async () => {
    const token = await issueToken({ sessionVersion: 1 });
    storedUser = user({ sessionVersion: 2 });

    await expect(
      requireSession(requestWith(`devmentor_session=${token}`), cradle()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('reuses the scope’s resolution when the scope was opened for this request', async () => {
    // The property B2's "one indexed primary-key lookup" cost claim rests on: the scoped
    // key already holds the answer, so the guard must not perform a second lookup.
    const token = await issueToken();
    const cached: Session = { userId: 'user-1', roles: ['mentee', 'operator'] };
    const scope = cradle({
      sessionCookie: token,
      session: Promise.resolve(cached),
    });

    const session = await requireSession(requestWith(`devmentor_session=${token}`), scope);

    expect(session).toBe(cached);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('resolves independently when the scope was opened for something else', async () => {
    // A plain `withScope` holds no cookie. Answering from its `null` session would deny a
    // perfectly good request; answering from a *different* request's cookie would be far
    // worse, so the guard compares before it trusts.
    const token = await issueToken();
    const scope = cradle({
      sessionCookie: 'a-different-request-cookie',
      session: Promise.resolve(null),
    });

    await expect(
      requireSession(requestWith(`devmentor_session=${token}`), scope),
    ).resolves.toEqual({ userId: 'user-1', roles: ['mentee'] });
    expect(findOne).toHaveBeenCalledOnce();
  });

  it('throws 401 when the scope resolved to no session', async () => {
    await expect(
      requireSession(requestWith(null), cradle({ sessionCookie: null })),
    ).rejects.toThrow('Authentication required');
  });
});

describe('requireRole', () => {
  const session: Session = { userId: 'user-1', roles: ['mentee', 'operator'] };

  it('returns the session when the role is held', () => {
    expect(requireRole(session, 'operator')).toBe(session);
  });

  it('tests membership, not the first role', () => {
    expect(requireRole(session, 'mentee')).toBe(session);
  });

  it('throws 403 when the role is not held', () => {
    expect(() => requireRole(session, 'mentor')).toThrow(ForbiddenError);
  });

  it('throws 403 for a single-role session missing the required role', () => {
    expect(() => requireRole({ userId: 'u', roles: ['mentee'] }, 'operator')).toThrow(
      'You do not have access to this resource',
    );
  });
});

describe('assertOwnership', () => {
  const session: Session = { userId: 'user-1', roles: ['mentee'] };

  it('passes when the session owns the resource', () => {
    expect(() => assertOwnership(session, 'user-1')).not.toThrow();
  });

  it('throws 403 for someone else’s resource', () => {
    expect(() => assertOwnership(session, 'user-2')).toThrow(ForbiddenError);
  });
});

describe('requireCsrfHeader', () => {
  it('exposes the header name the client sends', () => {
    expect(CSRF_HEADER).toBe('x-devmentor-request');
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('exempts %s, which cannot change state', (method) => {
    expect(() => requireCsrfHeader(requestWith(null, method))).not.toThrow();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses %s without the header',
    (method) => {
      expect(() => requireCsrfHeader(requestWith(null, method))).toThrow(ForbiddenError);
    },
  );

  it('names the header in the refusal so the fix is obvious', () => {
    expect(() => requireCsrfHeader(requestWith(null, 'POST'))).toThrow(
      /x-devmentor-request/,
    );
  });

  it('accepts a mutating request that carries the header', () => {
    const req = new Request('http://devmentor.test/api/users', {
      method: 'POST',
      headers: { [CSRF_HEADER]: '1' },
    });

    expect(() => requireCsrfHeader(req)).not.toThrow();
  });

  it('accepts the header whatever its value, since only its presence is forgeable', () => {
    // The defence is that a cross-origin request cannot set a custom header at all: a
    // preflight is triggered and never answered, and an HTML form cannot set one. Checking
    // the value would imply a secret this design deliberately does not have.
    const req = new Request('http://devmentor.test/api/users', {
      method: 'DELETE',
      headers: { [CSRF_HEADER]: '' },
    });

    expect(() => requireCsrfHeader(req)).not.toThrow();
  });
});

import type { ApiRouteContext, Cradle, Session } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sign-out is the one operation that must always succeed, so most of these cases are about
 * the ways it could have been made to fail: an expired cookie, a tampered one, a session
 * that cannot be resolved at all. The one thing it must *not* do unconditionally is bump
 * `session_version` — that ends the user's other devices, and there is nothing to end when
 * no live session was presented (edge case 27).
 */
const container = vi.hoisted(() => ({
  withRequestScope: vi.fn(),
  endAllSessions: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withRequestScope: container.withRequestScope,
}));

const route = await import('./route');

const context = { params: Promise.resolve({}) } as ApiRouteContext;
const EXPIRED_COOKIE = 'devmentor_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';

/** The scoped `session` key as awilix hands it over: resolved once, and possibly rejected. */
let session: Promise<Session | null>;

function logout(headers: Record<string, string> = { 'x-devmentor-request': '1' }) {
  return route.POST(
    new Request('http://devmentor.test/api/auth/logout', { method: 'POST', headers }),
    context,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  session = Promise.resolve(null);
  container.clear.mockReturnValue(EXPIRED_COOKIE);
  container.withRequestScope.mockImplementation(
    (_req: Request, fn: (cradle: Cradle) => unknown) =>
      Promise.resolve().then(() =>
        fn({
          session,
          sessionService: { clear: container.clear },
          userService: { endAllSessions: container.endAllSessions },
        } as unknown as Cradle),
      ),
  );
});

describe('/api/auth/logout route shape', () => {
  it('exports POST and force-dynamic, and no GET that a link could trigger', () => {
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});

describe('signing out with a live session', () => {
  beforeEach(() => {
    session = Promise.resolve({ userId: 'user-1', roles: ['mentee'] });
  });

  it('answers the success envelope and expires the cookie', async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ ok: true, data: null });
    expect(response.headers.getSetCookie()).toEqual([EXPIRED_COOKIE]);
  });

  it('bumps session_version, so a copied cookie dies with this one', async () => {
    await logout();

    expect(container.endAllSessions).toHaveBeenCalledWith('user-1');
  });
});

describe('signing out without one', () => {
  it('succeeds with an expired or tampered cookie and bumps nothing', async () => {
    // `resolveSessionFromCookie` answers `null` for expired, tampered, malformed, and for
    // a cookie whose `sv` no longer matches. All of them arrive here identically.
    const response = await logout();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: null });
    expect(response.headers.getSetCookie()).toEqual([EXPIRED_COOKIE]);
    expect(container.endAllSessions).not.toHaveBeenCalled();
  });

  it('still clears the cookie when the session could not be resolved at all', async () => {
    // A corrupt role set, or a `SESSION_SECRET` this deployment no longer has. Refusing
    // would strand the caller with a cookie they cannot get rid of.
    session = Promise.reject(new Error('user user-1 has no roles'));

    const response = await logout();

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([EXPIRED_COOKIE]);
    expect(container.endAllSessions).not.toHaveBeenCalled();
  });
});

describe('CSRF', () => {
  it('is refused without the x-devmentor-request header, before any work is done', async () => {
    const response = await logout({});

    // `apiHandler` enforces it for every non-GET; the route says nothing about CSRF itself.
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(container.withRequestScope).not.toHaveBeenCalled();
    expect(container.clear).not.toHaveBeenCalled();
  });
});

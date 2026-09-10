import { SESSION_COOKIE_NAME, type Cradle, type Role, type Session } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two seams, and no Next internals asserted against (AGENTS.md, "Testing React components
 * and pages"):
 *
 * - `next/headers` supplies the cookie, so the guards can be exercised signed in and signed
 *   out without a server.
 * - `next/navigation`'s `redirect` **throws**, exactly as the real one does. That is the
 *   whole point of the helper: a denied render is abandoned, not returned from, so every
 *   refusal below is asserted as a throw *and* as the URL the browser is sent to. A mock
 *   that returned instead would let the code under test carry on past its own guard and
 *   quietly prove the opposite of what it claims.
 *
 * `withCookieScope` is mocked because the alternative is a database: it is `core`'s scope
 * factory, and what this file is testing is which cookie value reaches it and what the app
 * does with the session it yields — the resolution itself is `http/auth.ts`'s own tests.
 */

class RedirectSentinel extends Error {
  constructor(readonly location: string) {
    super(`NEXT_REDIRECT:${location}`);
    this.name = 'RedirectSentinel';
  }
}

const next = vi.hoisted(() => ({ cookies: vi.fn(), redirect: vi.fn() }));
const core = vi.hoisted(() => ({ withCookieScope: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: next.cookies }));
vi.mock('next/navigation', () => ({ redirect: next.redirect }));
vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withCookieScope: core.withCookieScope,
}));

const {
  getPageSession,
  homeFor,
  redirectIfSignedIn,
  requirePageRole,
  requirePageSession,
} = await import(
  './session'
);

const MENTEE: Session = { userId: 'u-mentee', roles: ['mentee'] };
const OPERATOR: Session = { userId: 'u-operator', roles: ['mentee', 'operator'] };

/** The cookie the mocked `cookies()` store holds, or `undefined` for a signed-out visitor. */
let cookieValue: string | undefined;
/** What the scope's lazy `session` key resolves to. */
let scopeSession: Session | null;

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue = 'signed.session.jwt';
  scopeSession = MENTEE;

  next.cookies.mockImplementation(() =>
    Promise.resolve({
      get: (name: string) =>
        name === SESSION_COOKIE_NAME && cookieValue !== undefined
          ? { name, value: cookieValue }
          : undefined,
    }),
  );
  next.redirect.mockImplementation((location: string) => {
    throw new RedirectSentinel(location);
  });
  core.withCookieScope.mockImplementation((_cookie: string | null, fn: (c: Cradle) => unknown) =>
    Promise.resolve().then(() => fn({ session: Promise.resolve(scopeSession) } as Cradle)),
  );
});

/** Where a call was redirected to, failing the test if it was allowed through. */
async function locationAfter(call: Promise<unknown>): Promise<string> {
  const error = await call.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(RedirectSentinel);
  return (error as RedirectSentinel).location;
}

/**
 * `homeFor` is the single place the default landing is decided (spec UI/UX, "Role homes").
 * The OAuth callback and every page guard route through it, so the priority is asserted
 * here and nowhere else.
 */
describe('homeFor', () => {
  it.each([
    [['mentee'], '/home'],
    [['mentor'], '/mentor'],
    [['operator'], '/admin'],
  ] as ReadonlyArray<[Role[], string]>)('sends a %s to %s', (roles, expected) => {
    expect(homeFor(roles)).toBe(expected);
  });

  it('prefers operator over every other role', () => {
    expect(homeFor(['mentee', 'operator'])).toBe('/admin');
    expect(homeFor(['mentor', 'operator'])).toBe('/admin');
    expect(homeFor(['mentee', 'mentor', 'operator'])).toBe('/admin');
  });

  it('prefers mentor over mentee', () => {
    expect(homeFor(['mentee', 'mentor'])).toBe('/mentor');
  });

  it('does not depend on the order the roles arrive in', () => {
    expect(homeFor(['operator', 'mentee'])).toBe(homeFor(['mentee', 'operator']));
    expect(homeFor(['mentor', 'mentee'])).toBe(homeFor(['mentee', 'mentor']));
  });

  it('is total: an empty set still answers, rather than returning undefined', () => {
    // Unreachable in practice — `users.roles` is constrained non-empty and both
    // `resolveSessionFromCookie` and `UserService` refuse an empty derived set before a
    // caller could get here — but the fallback is what lets the parameter be a plain array
    // instead of a non-empty tuple, so it is asserted rather than assumed.
    expect(homeFor([])).toBe('/home');
  });
});

describe('getPageSession', () => {
  it('resolves the session cookie inside a request scope', async () => {
    await expect(getPageSession()).resolves.toBe(MENTEE);
    // The cookie *value*, not the cookie object and not a synthesized `Request`: the scope
    // is what verifies it, and this helper only carries it there.
    expect(core.withCookieScope).toHaveBeenCalledWith('signed.session.jwt', expect.any(Function));
  });

  it('opens the scope with null when the visitor has no session cookie', async () => {
    cookieValue = undefined;
    scopeSession = null;

    await expect(getPageSession()).resolves.toBeNull();
    expect(core.withCookieScope).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it('reports no session for a cookie the scope refuses', async () => {
    // Tampered, expired, signed with an unknown secret, or a bumped `session_version` all
    // arrive identically as `null` (edge case 10). The helper does not distinguish them.
    scopeSession = null;

    await expect(getPageSession()).resolves.toBeNull();
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it('lets a corrupt role set surface rather than reading as signed out', async () => {
    // Edge case 30b: a 500 that names the broken row, never a redirect that would loop the
    // user through sign-in and hide the data bug.
    const corrupt = new Error('User u-1 has no roles.');
    core.withCookieScope.mockRejectedValueOnce(corrupt);

    await expect(getPageSession()).rejects.toBe(corrupt);
  });
});

describe('requirePageSession', () => {
  it('returns the session of a signed-in visitor', async () => {
    await expect(requirePageSession('/home')).resolves.toBe(MENTEE);
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to sign-in, carrying where they were going', async () => {
    scopeSession = null;

    expect(await locationAfter(requirePageSession('/admin/users'))).toBe(
      '/sign-in?returnTo=%2Fadmin%2Fusers',
    );
  });

  it('encodes a returnTo that carries a query string', async () => {
    scopeSession = null;

    // The slot picker's case: losing `?slot=` would land the user on a page that has
    // forgotten what they were doing.
    expect(await locationAfter(requirePageSession('/mentors/ada?slot=2026-09-10T10:00'))).toBe(
      '/sign-in?returnTo=%2Fmentors%2Fada%3Fslot%3D2026-09-10T10%3A00',
    );
  });

  it.each([
    ['//evil.example', 'an off-site authority'],
    ['https://evil.example/', 'an absolute URL'],
    ['/api/users', 'a JSON endpoint'],
  ])('drops %s as a returnTo (%s)', async (path) => {
    scopeSession = null;

    // Defence in depth: this value is the app's own, but a dynamic segment interpolates
    // user-controlled text into it. `safeReturnTo` rejects, and sign-in falls back to
    // `homeFor` rather than to a guess made here.
    expect(await locationAfter(requirePageSession(path))).toBe('/sign-in');
  });

  it('abandons the render instead of returning a null session', async () => {
    scopeSession = null;

    // The guarantee behind "nothing of the user's is rendered first" (#12). If `redirect`
    // ever returned, the page beneath would render with no session at all.
    await expect(requirePageSession('/home')).rejects.toBeInstanceOf(RedirectSentinel);
    expect(next.redirect).toHaveBeenCalledExactlyOnceWith('/sign-in?returnTo=%2Fhome');
  });
});

describe('requirePageRole', () => {
  it('returns the session when the required role is held', async () => {
    scopeSession = MENTEE;

    await expect(requirePageRole('mentee', '/home')).resolves.toBe(MENTEE);
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it('admits a combined-role user to every surface they hold a role for', async () => {
    scopeSession = OPERATOR;

    await expect(requirePageRole('operator', '/admin')).resolves.toBe(OPERATOR);
    await expect(requirePageRole('mentee', '/home')).resolves.toBe(OPERATOR);
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it('sends a mentee who opens a mentor screen to their own home, not to sign-in', async () => {
    // Edge case 19. They are signed in; `/sign-in` would re-authenticate them into exactly
    // the same refusal.
    scopeSession = MENTEE;

    expect(await locationAfter(requirePageRole('mentor', '/mentor/slots'))).toBe('/home');
  });

  it('refuses a mentor who opens /admin, and lands them on /mentor', async () => {
    // Edge case 20.
    scopeSession = { userId: 'u-mentor', roles: ['mentee', 'mentor'] };

    expect(await locationAfter(requirePageRole('operator', '/admin/users'))).toBe('/mentor');
  });

  it('refuses a revoked operator on the page, not only in the layout', async () => {
    // Edge case 21: the guard is called by the page itself, so a client-side navigation
    // from `/admin` to `/admin/users` re-checks against live roles even though the layout
    // above it never re-rendered.
    scopeSession = { userId: 'u-was-operator', roles: ['mentee'] };

    expect(await locationAfter(requirePageRole('operator', '/admin/users'))).toBe('/home');
    expect(core.withCookieScope).toHaveBeenCalledOnce();
  });

  it('sends a signed-out visitor to sign-in rather than to a role home', async () => {
    scopeSession = null;

    expect(await locationAfter(requirePageRole('operator', '/admin'))).toBe(
      '/sign-in?returnTo=%2Fadmin',
    );
  });
});

describe('redirectIfSignedIn', () => {
  it('lets a signed-out visitor through to the sign-in form', async () => {
    scopeSession = null;

    await expect(redirectIfSignedIn()).resolves.toBeUndefined();
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it('sends a signed-in visitor to their role home instead of round-tripping GitHub', async () => {
    // Edge case 28. The destination is `homeFor`, not `?returnTo`: the OAuth flow carries
    // that parameter itself, so anyone reaching this branch has already finished signing in.
    scopeSession = OPERATOR;

    expect(await locationAfter(redirectIfSignedIn())).toBe('/admin');
  });

  it('uses the same priority as every other landing decision', async () => {
    scopeSession = { userId: 'u-both', roles: ['mentee', 'mentor'] };

    expect(await locationAfter(redirectIfSignedIn())).toBe('/mentor');
  });
});

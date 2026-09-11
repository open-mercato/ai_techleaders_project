import {
  ConflictError,
  ServiceUnavailableError,
  type ApiRouteContext,
  type Cradle,
  type GithubIdentity,
  type Role,
  type SignedInUser,
} from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The container is stubbed; everything the route decides for itself is real —
 * `readOauthStateCookie`, `safeReturnTo`, `homeFor`, `apiHandler`. The claims worth making
 * about this route are all about *ordering* and about *what a browser sees*, so the tests
 * are written against those two axes: nothing outbound happens before the state pair
 * matches, and no failure ever answers with the JSON envelope.
 */
const container = vi.hoisted(() => ({
  withScope: vi.fn(),
  verifyPurposeToken: vi.fn(),
  exchangeCode: vi.fn(),
  fetchIdentity: vi.fn(),
  findOrCreateFromGithub: vi.fn(),
  issue: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@devmentor/core')>();
  return {
    ...core,
    withScope: container.withScope,
    getEnv: () => ({ NODE_ENV: 'test' }),
    createLogger: () => ({ error: container.logError }),
  };
});

const route = await import('./route');

const context = { params: Promise.resolve({}) } as ApiRouteContext;

const STATE = 'state.token';
const CLEARED_STATE = 'devmentor_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';
const SESSION_COOKIE = 'devmentor_session=session.jwt; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax';

const IDENTITY: GithubIdentity = {
  githubId: '4242',
  githubLogin: 'ada',
  email: 'ada@devmentor.dev',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
};

function signedIn(roles: Role[], id = 'user-1'): SignedInUser {
  return {
    user: {
      id,
      email: IDENTITY.email,
      displayName: IDENTITY.displayName,
      roles,
      githubLogin: IDENTITY.githubLogin,
      avatarUrl: null,
      createdAt: '2026-09-09T12:00:00.000Z',
      mentorProfile: null,
    },
    sessionVersion: 3,
  };
}

interface CallbackOptions {
  query?: string;
  /** The `devmentor_oauth_state` cookie the browser sends back, or none at all. */
  stateCookie?: string | null;
}

function callback({ query = `?code=gh-code&state=${STATE}`, stateCookie = STATE }: CallbackOptions = {}) {
  return route.GET(
    new Request(`http://devmentor.test/api/auth/github/callback${query}`, {
      headers:
        stateCookie === null
          ? {}
          : { cookie: `theme=dark; devmentor_oauth_state=${stateCookie}` },
    }),
    context,
  );
}

function cookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/** Nothing left the process: no token exchange, no profile read, no row touched. */
function expectNothingHappened(): void {
  expect(container.exchangeCode).not.toHaveBeenCalled();
  expect(container.fetchIdentity).not.toHaveBeenCalled();
  expect(container.findOrCreateFromGithub).not.toHaveBeenCalled();
  expect(container.issue).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  container.verifyPurposeToken.mockResolvedValue({ subject: '' });
  container.exchangeCode.mockResolvedValue('gh-token');
  container.fetchIdentity.mockResolvedValue(IDENTITY);
  container.findOrCreateFromGithub.mockResolvedValue(signedIn(['mentee']));
  container.issue.mockResolvedValue({ cookie: SESSION_COOKIE, expiresAt: new Date() });
  container.withScope.mockImplementation((fn: (cradle: Cradle) => unknown) =>
    Promise.resolve().then(() =>
      fn({
        tokenService: { verifyPurposeToken: container.verifyPurposeToken },
        githubIdentity: {
          exchangeCode: container.exchangeCode,
          fetchIdentity: container.fetchIdentity,
        },
        userService: { findOrCreateFromGithub: container.findOrCreateFromGithub },
        sessionService: { issue: container.issue },
      } as unknown as Cradle),
    ),
  );
});

describe('/api/auth/github/callback route shape', () => {
  it('exports GET and force-dynamic, and nothing else', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});

describe('a provider-side refusal', () => {
  it('reports a cancelled authorisation as ?cancelled=1 and creates nothing', async () => {
    const response = await callback({ query: '?error=access_denied' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-in?cancelled=1');
    expectNothingHappened();
  });

  it('treats any other provider error as unavailable', async () => {
    const response = await callback({ query: '?error=redirect_uri_mismatch' });

    expect(response.headers.get('location')).toBe('/sign-in?error=unavailable');
    expectNothingHappened();
  });

  it('expires the state cookie even on a cancellation', async () => {
    expect(cookies(await callback({ query: '?error=access_denied' }))).toEqual([CLEARED_STATE]);
  });
});

describe('the state pair, which is what stops login CSRF', () => {
  it.each([
    { reason: 'no ?state at all', query: '?code=gh-code', stateCookie: STATE },
    { reason: 'no state cookie', query: `?code=gh-code&state=${STATE}`, stateCookie: null },
    {
      reason: 'a cookie that does not match',
      query: `?code=gh-code&state=${STATE}`,
      stateCookie: 'a.different.token',
    },
    { reason: 'an empty ?state', query: '?code=gh-code&state=', stateCookie: STATE },
  ])('refuses a callback with $reason using ?error=state', async ({ query, stateCookie }) => {
    const response = await callback({ query, stateCookie });

    expect(response.headers.get('location')).toBe('/sign-in?error=state');
    // Rejected before the signature is even looked at, and therefore before anything
    // leaves the process: a forged callback costs GitHub nothing.
    expect(container.verifyPurposeToken).not.toHaveBeenCalled();
    expectNothingHappened();
  });

  it('compares for equality before it verifies the signature', async () => {
    // The attacker's own state is perfectly well signed — a purpose token proves the claim,
    // not the bearer — so a mismatch must be refused without the token service having an
    // opinion about it.
    container.verifyPurposeToken.mockResolvedValue({ subject: '/admin' });

    const response = await callback({ stateCookie: 'attacker.state.token' });

    expect(response.headers.get('location')).toBe('/sign-in?error=state');
    expect(container.verifyPurposeToken).not.toHaveBeenCalled();
  });

  it('refuses an expired, tampered or foreign state token with ?error=state', async () => {
    container.verifyPurposeToken.mockResolvedValue(null);

    const response = await callback();

    expect(container.verifyPurposeToken).toHaveBeenCalledWith({
      token: STATE,
      purpose: 'oauth-state',
    });
    expect(response.headers.get('location')).toBe('/sign-in?error=state');
    expectNothingHappened();
  });

  it('expires the state cookie on every refusal, so a state is single-use', async () => {
    container.verifyPurposeToken.mockResolvedValue(null);

    expect(cookies(await callback())).toEqual([CLEARED_STATE]);
    expect(cookies(await callback({ stateCookie: null }))).toEqual([CLEARED_STATE]);
  });

  it('treats a matching pair with no ?code as an upstream problem, not a forged callback', async () => {
    const response = await callback({ query: `?state=${STATE}` });

    expect(response.headers.get('location')).toBe('/sign-in?error=unavailable');
    expectNothingHappened();
  });
});

describe('the happy path', () => {
  it('exchanges the code, resolves the identity and signs the user in', async () => {
    const response = await callback();

    expect(container.exchangeCode).toHaveBeenCalledWith('gh-code');
    expect(container.fetchIdentity).toHaveBeenCalledWith('gh-token');
    expect(container.findOrCreateFromGithub).toHaveBeenCalledWith(IDENTITY);
    expect(container.issue).toHaveBeenCalledWith({ id: 'user-1', sessionVersion: 3 });
    expect(response.status).toBe(302);
  });

  it('sets the session cookie and expires the state cookie, in that order', async () => {
    // Two `Set-Cookie` headers, not one joined value: `Response.redirect()` could carry
    // neither (2026-09-04 lesson).
    expect(cookies(await callback())).toEqual([SESSION_COOKIE, CLEARED_STATE]);
  });

  it.each([
    [['mentee'], '/home'],
    [['mentor'], '/mentor'],
    [['operator'], '/admin'],
    [['mentee', 'mentor'], '/mentor'],
    [['mentor', 'operator'], '/admin'],
    [['mentee', 'mentor', 'operator'], '/admin'],
  ] as ReadonlyArray<[Role[], string]>)('lands %s on %s', async (roles, expected) => {
    container.findOrCreateFromGithub.mockResolvedValue(signedIn(roles));

    expect((await callback()).headers.get('location')).toBe(expected);
  });

  it('honours a returnTo carried through the state token', async () => {
    container.verifyPurposeToken.mockResolvedValue({ subject: '/mentors/ada?slot=9' });

    expect((await callback()).headers.get('location')).toBe('/mentors/ada?slot=9');
  });

  it.each([
    ['//evil.example', 'protocol-relative'],
    ['https://evil.example/', 'absolute'],
    ['/api/users', 'a JSON envelope rendered as a page'],
    ['/_next/static/chunk.js', 'a build asset'],
  ])('re-sanitises %s (%s) back to the role home', async (subject) => {
    // The subject was validated at the start route and signed ever since, so this is belt
    // and braces — but a signed value is not a safe value, and this is the last gate.
    container.verifyPurposeToken.mockResolvedValue({ subject });
    container.findOrCreateFromGithub.mockResolvedValue(signedIn(['mentor']));

    expect((await callback()).headers.get('location')).toBe('/mentor');
  });
});

describe('when the sign-in cannot be completed', () => {
  it('reports a GitHub account with no verified primary email as ?error=email', async () => {
    // Edge case 3, refused by the adapter with a 409. It must reach the sign-in page as a
    // code it can render, never as a JSON envelope in the browser.
    container.fetchIdentity.mockRejectedValue(new ConflictError('no verified primary email'));

    const response = await callback();

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-in?error=email');
    expect(response.headers.get('content-type')).toBeNull();
    await expect(response.text()).resolves.toBe('');
    expect(container.issue).not.toHaveBeenCalled();
  });

  it('reports an unconfirmed matching account the same way', async () => {
    // Edge case 4 — the other `ConflictError` in this flow, indistinguishable to a caller.
    container.findOrCreateFromGithub.mockRejectedValue(new ConflictError('not confirmed yet'));

    expect((await callback()).headers.get('location')).toBe('/sign-in?error=email');
  });

  it.each([
    ['exchangeCode', () => container.exchangeCode],
    ['fetchIdentity', () => container.fetchIdentity],
  ])('reports a GitHub outage during %s as ?error=unavailable', async (_name, fn) => {
    fn().mockRejectedValue(new ServiceUnavailableError('GitHub is unavailable'));

    const response = await callback();

    expect(response.headers.get('location')).toBe('/sign-in?error=unavailable');
    expect(container.issue).not.toHaveBeenCalled();
  });

  it('redirects, and logs, when something unexpected breaks', async () => {
    const failure = new Error('the database went away');
    container.findOrCreateFromGithub.mockRejectedValue(failure);

    const response = await callback();

    expect(response.headers.get('location')).toBe('/sign-in?error=unavailable');
    expect(container.logError).toHaveBeenCalledWith(
      { err: failure, route: '/api/auth/github/callback' },
      'unhandled failure in the GitHub sign-in flow',
    );
  });

  it('still expires the state cookie when the flow threw', async () => {
    container.exchangeCode.mockRejectedValue(new ServiceUnavailableError());

    expect(cookies(await callback())).toEqual([CLEARED_STATE]);
  });

  it('redirects rather than 500ing when the container itself cannot be built', async () => {
    container.withScope.mockRejectedValue(new Error('no database'));

    const response = await callback();

    expect(response.headers.get('location')).toBe('/sign-in?error=unavailable');
    expect(cookies(response)).toEqual([CLEARED_STATE]);
  });
});

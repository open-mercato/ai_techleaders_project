import {
  ServiceUnavailableError,
  type ApiRouteContext,
  type AuthorizeUrlInput,
  type Cradle,
} from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The container is the only thing stubbed. `apiHandler`, `safeReturnTo`,
 * `issueOauthStateCookie` and the `?login` rule are the real implementations, because what
 * is worth asserting here *is* the composition: that a hostile `returnTo` never reaches the
 * state token, that a malformed `?login` is dropped rather than refused, that the state in
 * the cookie is the state in the URL, and — the whole point of a browser-navigated route —
 * that an unconfigured deployment answers with a redirect instead of a JSON envelope.
 */
const container = vi.hoisted(() => ({
  withScope: vi.fn(),
  signPurposeToken: vi.fn(),
  authorizeUrl: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@devmentor/core')>();
  return {
    ...core,
    withScope: container.withScope,
    // The real `getEnv()` would read the ambient process environment; the cookie's only
    // dependency on it is the production-only `Secure` flag.
    getEnv: () => ({ NODE_ENV: 'test' }),
    createLogger: () => ({ error: container.logError }),
  };
});

const route = await import('./route');

const context = { params: Promise.resolve({}) } as ApiRouteContext;

function start(query = ''): Promise<Response> {
  return route.GET(new Request(`http://devmentor.test/api/auth/github${query}`), context);
}

/** The `authorizeUrl` input the route built, which is what the assertions are about. */
function authorizeInput(): AuthorizeUrlInput {
  expect(container.authorizeUrl).toHaveBeenCalledTimes(1);
  return container.authorizeUrl.mock.calls[0]?.[0] as AuthorizeUrlInput;
}

function cookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

beforeEach(() => {
  vi.clearAllMocks();
  container.signPurposeToken.mockResolvedValue('state.token');
  container.authorizeUrl.mockReturnValue('https://github.com/login/oauth/authorize?state=x');
  container.withScope.mockImplementation((fn: (cradle: Cradle) => unknown) =>
    Promise.resolve().then(() =>
      fn({
        tokenService: { signPurposeToken: container.signPurposeToken },
        githubIdentity: { authorizeUrl: container.authorizeUrl },
      } as unknown as Cradle),
    ),
  );
});

describe('/api/auth/github route shape', () => {
  it('exports GET and force-dynamic, and nothing else', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});

describe('starting the GitHub flow', () => {
  it('redirects to whatever the identity adapter returns, without CSRF header', async () => {
    const response = await start();

    // A `GET` is CSRF-exempt in `apiHandler`, which is what lets a plain link start the
    // flow — the request above carries no `x-devmentor-request`.
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://github.com/login/oauth/authorize?state=x',
    );
  });

  it('emits an origin-relative Location verbatim when the mock adapter answers', async () => {
    // REGRESSION (2026-09-10). The state cookie set below is bound to the origin the
    // browser is actually on, so the callback the mock sends it to must be on that same
    // origin. `MockGithubIdentityAdapter.authorizeUrl` returns exactly this shape; the
    // route's job is to put it in `Location` untouched, adding no origin of its own.
    container.authorizeUrl.mockReturnValue(
      '/api/auth/github/callback?code=mock-code-mock-mentee&state=state.token',
    );

    const response = await start();
    const location = response.headers.get('location') as string;

    expect(location).toBe('/api/auth/github/callback?code=mock-code-mock-mentee&state=state.token');
    expect(location).not.toMatch(/^[a-zA-Z][a-zA-Z0-9+.-]*:/);
    expect(location.startsWith('//')).toBe(false);
    // The request was made to `devmentor.test`; the redirect resolves back to it, which is
    // the same origin the `devmentor_oauth_state` cookie was just set on.
    expect(new URL(location, 'http://devmentor.test').origin).toBe('http://devmentor.test');
    expect(cookies(response)[0]).toContain('devmentor_oauth_state=state.token;');
  });

  it('mints a ten-minute oauth-state token and pins it to this browser', async () => {
    const response = await start();

    expect(container.signPurposeToken).toHaveBeenCalledWith({
      purpose: 'oauth-state',
      subject: '',
      ttlSeconds: 600,
    });
    expect(cookies(response)).toEqual([
      'devmentor_oauth_state=state.token; Path=/; Max-Age=600; HttpOnly; SameSite=Lax',
    ]);
  });

  it('sends the adapter the same state it put in the cookie', async () => {
    const response = await start();

    expect(cookies(response)[0]).toContain(`=${authorizeInput().state};`);
  });
});

describe('the ?login hint', () => {
  it.each([
    ['ada', 'ada'],
    ['mock-operator', 'mock-operator'],
    ['a', 'a'],
    ['9'.repeat(39), '9'.repeat(39)],
  ])('forwards the valid login %s', async (login, expected) => {
    await start(`?login=${login}`);

    expect(authorizeInput().login).toBe(expected);
  });

  it.each([
    ['9'.repeat(40), 'longer than GitHub allows'],
    ['ada lovelace', 'a space'],
    ['ada@devmentor.dev', 'an address rather than a login'],
    ['', 'empty'],
    ['../../etc/passwd', 'a traversal attempt'],
    ['ada%0d%0aSet-Cookie:%20x=1', 'a header-splitting attempt'],
  ])('drops the malformed login %j (%s) without refusing the sign-in', async (login) => {
    const response = await start(`?login=${encodeURIComponent(login)}`);

    // Dropped, not rejected: a hint is cosmetic, and refusing would be a dead end.
    expect(response.status).toBe(302);
    expect(authorizeInput().login).toBeUndefined();
  });

  it('omits the hint entirely when none was asked for', async () => {
    await start();

    expect(authorizeInput().login).toBeUndefined();
  });
});

describe('the ?returnTo round trip', () => {
  it('carries an acceptable page path as the state token subject', async () => {
    await start('?returnTo=%2Fmentors%2Fada%3Fslot%3D9');

    expect(container.signPurposeToken).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '/mentors/ada?slot=9' }),
    );
  });

  it.each([
    ['//evil.example', 'protocol-relative'],
    ['https://evil.example', 'absolute'],
    ['/api/auth/github', 're-entering the OAuth start route'],
    ['/_next/static/chunk.js', 'a build asset'],
    ['not-a-path', 'no leading slash'],
  ])('reduces %s (%s) to no destination at all', async (returnTo) => {
    await start(`?returnTo=${encodeURIComponent(returnTo)}`);

    expect(container.signPurposeToken).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '' }),
    );
  });
});

describe('when the deployment cannot start a sign-in', () => {
  it('redirects to ?error=unavailable when GitHub credentials are unset', async () => {
    container.authorizeUrl.mockImplementation(() => {
      throw new ServiceUnavailableError('GitHub sign-in is not configured.');
    });

    const response = await start();

    // Never a JSON envelope: this route is opened by a click, not by `apiCall`.
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-in?error=unavailable');
    expect(response.headers.get('content-type')).toBeNull();
    await expect(response.text()).resolves.toBe('');
  });

  it('redirects to ?error=unavailable when SESSION_SECRET is unset', async () => {
    container.signPurposeToken.mockRejectedValue(
      new ServiceUnavailableError('Signed links are unavailable'),
    );

    expect((await start()).headers.get('location')).toBe('/sign-in?error=unavailable');
    expect(container.authorizeUrl).not.toHaveBeenCalled();
  });

  it('sets no state cookie on a failure, so nothing is left pinned to the browser', async () => {
    container.signPurposeToken.mockRejectedValue(new ServiceUnavailableError());

    expect(cookies(await start())).toEqual([]);
  });

  it('redirects rather than 500ing when the container itself cannot be built', async () => {
    const failure = new Error('no database');
    container.withScope.mockRejectedValue(failure);

    expect((await start()).headers.get('location')).toBe('/sign-in?error=unavailable');
    // Unexpected, so it is logged rather than swallowed — `apiHandler` would have logged
    // it too, but `apiHandler` would also have rendered a 500 envelope into the browser.
    expect(container.logError).toHaveBeenCalledWith(
      { err: failure, route: '/api/auth/github' },
      'unhandled failure in the GitHub sign-in flow',
    );
  });
});

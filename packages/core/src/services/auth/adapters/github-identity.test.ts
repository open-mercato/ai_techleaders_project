import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env';
import type { Logger } from '../../../logger';
import { AppError, ConflictError, ServiceUnavailableError } from '../../../http/errors';
import { GithubIdentityAdapter } from './github-identity';

/**
 * `fetch` is stubbed, not `fetchJson`: the adapter's contract is "three real HTTP requests
 * with these URLs, headers and bodies, and every transport failure translated by B20". A
 * stubbed `fetchJson` would assert the adapter calls a function, which is not the part that
 * can be wrong. github.com is never contacted.
 *
 * `../../../logger` is mocked because `outbound.ts` builds its own logger at module scope;
 * without this every failure case would print a pino line to the test output.
 */
const testState = vi.hoisted(() => ({ outboundWarn: vi.fn() }));

vi.mock('../../../logger', () => ({
  createLogger: () => ({ warn: testState.outboundWarn }),
}));

const fetchMock = vi.fn();
const warn = vi.fn();
const logger = { warn } as unknown as Logger;

const ENV = {
  GITHUB_CLIENT_ID: 'client-id-value',
  GITHUB_CLIENT_SECRET: 'client-secret-value',
  APP_URL: 'https://devmentor.example',
} as unknown as AppEnv;

const ACCESS_TOKEN = 'gho-access-token-value';

function adapter(overrides: Partial<AppEnv> = {}): GithubIdentityAdapter {
  return new GithubIdentityAdapter({ env: { ...ENV, ...overrides }, logger });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ACCOUNT = { id: 42, login: 'ada', name: 'Ada Lovelace', avatar_url: 'https://a/1.png' };
const EMAILS = [
  { email: 'other@devmentor.dev', primary: false, verified: true },
  { email: 'ada@devmentor.dev', primary: true, verified: true },
];

/** Answer `/user` and `/user/emails` by URL, so `Promise.all`'s ordering is not assumed. */
function respondToIdentity(account: unknown = ACCOUNT, emails: unknown = EMAILS): void {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(jsonResponse(url.endsWith('/emails') ? emails : account)),
  );
}

/** The URL of the nth `fetch` call, in call order. */
function calledUrls(): string[] {
  return fetchMock.mock.calls.map((call) => call[0] as string);
}

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
}

/** Everything the adapter's own logger was handed, flattened for a substring search. */
function loggedText(): string {
  return JSON.stringify([...warn.mock.calls, ...testState.outboundWarn.mock.calls]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authorizeUrl', () => {
  it('sends the browser to GitHub with the credentials, scope and state', () => {
    const url = new URL(adapter().authorizeUrl({ state: 'state-token' }));

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id-value');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://devmentor.example/api/auth/github/callback',
    );
    // `user:email` is what makes `/user/emails` readable; without it no account could
    // ever produce the verified primary address sign-in requires.
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('state')).toBe('state-token');
  });

  it('stays absolute, unlike the mock, because GitHub requires it', () => {
    // The mock deliberately returns an origin-relative callback so the browser never
    // changes origin. This adapter must never be "simplified" the same way: the browser has
    // to be sent to github.com, and GitHub compares `redirect_uri` byte-for-byte against
    // the OAuth app's registered *absolute* URL, so `APP_URL` is genuinely the right input
    // here and only here.
    const location = adapter().authorizeUrl({ state: 'state-token' });

    expect(location.startsWith('https://github.com/login/oauth/authorize?')).toBe(true);
    expect(new URL(location).searchParams.get('redirect_uri')).toMatch(/^https:\/\//);
  });

  it('omits the account hint when none was asked for', () => {
    const url = new URL(adapter().authorizeUrl({ state: 'state-token' }));

    expect(url.searchParams.has('login')).toBe(false);
  });

  it('forwards the account hint to GitHub as its own `login` parameter', () => {
    // GitHub pre-selects the hinted account on the authorisation screen. The real adapter
    // does nothing else with it — the identity that comes back is whoever authorised.
    const url = new URL(adapter().authorizeUrl({ state: 'state-token', login: 'mock-mentor' }));

    expect(url.searchParams.get('login')).toBe('mock-mentor');
  });

  it('performs no I/O', () => {
    adapter().authorizeUrl({ state: 'state-token' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses with a 503 when the client id is unset', () => {
    // B6: *missing* configuration fails at the route, so the marketing site still boots
    // and serves without GitHub credentials (edge case 1).
    const error = (() => {
      try {
        adapter({ GITHUB_CLIENT_ID: undefined }).authorizeUrl({ state: 's' });
        return null;
      } catch (thrown) {
        return thrown;
      }
    })();

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).status).toBe(503);
    expect((error as AppError).message).toContain('GITHUB_CLIENT_ID');
  });

  it('refuses with a 503 when the client secret is unset', () => {
    expect(() => adapter({ GITHUB_CLIENT_SECRET: undefined }).authorizeUrl({ state: 's' })).toThrow(
      ServiceUnavailableError,
    );
  });

  it('never quotes a credential in the failure message', () => {
    expect(() => adapter({ GITHUB_CLIENT_ID: '' }).authorizeUrl({ state: 's' })).toThrow(
      /GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET/,
    );
  });
});

describe('exchangeCode', () => {
  it('trades the code for an access token in exactly one request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: ACCESS_TOKEN, scope: 'read:user' }));

    await expect(adapter().exchangeCode('callback-code')).resolves.toBe(ACCESS_TOKEN);

    expect(calledUrls()).toEqual(['https://github.com/login/oauth/access_token']);
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(lastInit().body as string)).toEqual({
      client_id: 'client-id-value',
      client_secret: 'client-secret-value',
      code: 'callback-code',
      // GitHub compares this against the authorize request's value, so both are built
      // from the one callback-path constant.
      redirect_uri: 'https://devmentor.example/api/auth/github/callback',
    });
  });

  it('asks for JSON, because GitHub answers form-encoded otherwise', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: ACCESS_TOKEN }));

    await adapter().exchangeCode('callback-code');

    expect((lastInit().headers as Record<string, string>).accept).toBe('application/json');
  });

  it('refuses with a 503 when GitHub rejects the code', async () => {
    // The refusal arrives as HTTP **200** with an error code, so nothing below `fetchJson`
    // can notice it. A stale, replayed or forged `code` all land here.
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'bad_verification_code', error_description: 'The code is expired.' }),
    );

    const error = await adapter()
      .exchangeCode('stale-code')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).status).toBe(503);
    expect(warn).toHaveBeenCalledWith(
      { reason: 'token exchange refused: bad_verification_code' },
      'github identity request failed',
    );
  });

  it('refuses with a 503 when the response carries neither a token nor an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ scope: 'read:user' }));

    await expect(adapter().exchangeCode('callback-code')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(warn).toHaveBeenCalledWith(
      { reason: 'token exchange refused: no access_token' },
      'github identity request failed',
    );
  });

  it('refuses with a 503 when the response is not the shape GitHub documents', async () => {
    fetchMock.mockResolvedValue(jsonResponse(['not', 'an', 'object']));

    const error = await adapter()
      .exchangeCode('callback-code')
      .catch((thrown: unknown) => thrown);

    // A `ZodError` escaping here would reach `apiHandler` as an unexpected 500.
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(warn).toHaveBeenCalledWith(
      { reason: 'malformed token-exchange response' },
      'github identity request failed',
    );
  });

  it('reports the upstream failure without the upstream body or the client secret', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'incorrect_client_credentials', error_description: 'nope' }),
    );

    const error = await adapter()
      .exchangeCode('callback-code')
      .catch((thrown: unknown) => thrown);

    expect((error as AppError).message).not.toContain('nope');
    expect(loggedText()).not.toContain('client-secret-value');
    expect(loggedText()).not.toContain('nope');
  });

  it('refuses with a 503 before any request when the credentials are unset', async () => {
    await expect(
      adapter({ GITHUB_CLIENT_SECRET: undefined }).exchangeCode('callback-code'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('translates an upstream 5xx into one retryable 503 (edge case 8)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'unicorn' }, 502));

    const error = await adapter()
      .exchangeCode('callback-code')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    // The upstream status never reaches the client; it rides in the cause for the logs.
    expect((error as AppError).status).toBe(503);
  });
});

describe('fetchIdentity', () => {
  it('resolves the token to an identity in exactly two requests', async () => {
    respondToIdentity();

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toEqual({
      githubId: '42',
      githubLogin: 'ada',
      email: 'ada@devmentor.dev',
      displayName: 'Ada Lovelace',
      avatarUrl: 'https://a/1.png',
    });

    expect(calledUrls().sort()).toEqual([
      'https://api.github.com/user',
      'https://api.github.com/user/emails',
    ]);
  });

  it('authenticates both requests and identifies itself to the API', async () => {
    respondToIdentity();

    await adapter().fetchIdentity(ACCESS_TOKEN);

    for (const call of fetchMock.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      // api.github.com answers 403 to a request without a User-Agent.
      expect(headers['user-agent']).toBe('DevMentor');
      expect(headers['x-github-api-version']).toBe('2022-11-28');
      expect(headers.accept).toBe('application/vnd.github+json');
    }
  });

  it('takes the account id as text, because the column stores it as varchar', async () => {
    respondToIdentity({ ...ACCOUNT, id: 1234567 });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toMatchObject({
      githubId: '1234567',
    });
  });

  it('falls back to the login when GitHub has no display name', async () => {
    respondToIdentity({ ...ACCOUNT, name: null });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toMatchObject({
      displayName: 'ada',
    });
  });

  it('falls back to the login when the display name is absent entirely', async () => {
    respondToIdentity({ id: 42, login: 'ada' });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toMatchObject({
      displayName: 'ada',
      avatarUrl: null,
    });
  });

  it('falls back to the login when the display name is only whitespace', async () => {
    // A blank display name would render as an empty account menu, so it is treated as
    // absent rather than stored.
    respondToIdentity({ ...ACCOUNT, name: '   ' });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toMatchObject({
      displayName: 'ada',
    });
  });

  it('trims a padded display name rather than storing the padding', async () => {
    respondToIdentity({ ...ACCOUNT, name: '  Ada Lovelace  ' });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toMatchObject({
      displayName: 'Ada Lovelace',
    });
  });

  it('reports a null avatar as null rather than dropping the field', async () => {
    respondToIdentity({ ...ACCOUNT, avatar_url: null });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).resolves.toMatchObject({
      avatarUrl: null,
    });
  });

  it('refuses an account with no verified primary email (edge case 3)', async () => {
    respondToIdentity(ACCOUNT, [{ email: 'ada@devmentor.dev', primary: true, verified: false }]);

    const error = await adapter()
      .fetchIdentity(ACCESS_TOKEN)
      .catch((thrown: unknown) => thrown);

    // Refused *with the reason* and nothing created: the address is what links an identity
    // to an account, so linking on an unverified one is an account-takeover vector.
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as AppError).status).toBe(409);
    expect((error as AppError).message).toContain('verified primary email');
  });

  it('refuses an account whose only verified address is not the primary one', async () => {
    respondToIdentity(ACCOUNT, [
      { email: 'side@devmentor.dev', primary: false, verified: true },
      { email: 'ada@devmentor.dev', primary: true, verified: false },
    ]);

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses an account with no addresses at all', async () => {
    respondToIdentity(ACCOUNT, []);

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses with a 503 when the account payload is not the shape GitHub documents', async () => {
    respondToIdentity({ login: 'ada' });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(warn).toHaveBeenCalledWith(
      { reason: 'malformed account payload' },
      'github identity request failed',
    );
  });

  it('refuses with a 503 when the email payload is not the shape GitHub documents', async () => {
    respondToIdentity(ACCOUNT, { email: 'ada@devmentor.dev' });

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(warn).toHaveBeenCalledWith(
      { reason: 'malformed email payload' },
      'github identity request failed',
    );
  });

  it('translates an upstream 5xx into one retryable 503 (edge case 8)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Server Error' }, 503));

    const error = await adapter()
      .fetchIdentity(ACCESS_TOKEN)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).status).toBe(503);
  });

  it('translates a timeout into a 503 rather than hanging the route (edge case 7)', async () => {
    // The abort itself is `AbortSignal.timeout`'s and is covered end to end in
    // `outbound.test.ts` with a 5 ms budget. Here the adapter takes B20's 10 s default,
    // which no test may wait out, so the rejection Node raises when that signal fires is
    // reproduced directly. What is asserted is the adapter's half: a hung GitHub reaches
    // the route as a retryable 503, never as a pending promise.
    fetchMock.mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    const error = await adapter()
      .fetchIdentity(ACCESS_TOKEN)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as Error).cause).toBeInstanceOf(DOMException);
  });

  it('always carries an abort signal, so no request can hang', async () => {
    respondToIdentity();

    await adapter().fetchIdentity(ACCESS_TOKEN);

    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('needs no credentials of its own — the token is the credential', async () => {
    respondToIdentity();

    await expect(
      adapter({ GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined }).fetchIdentity(
        ACCESS_TOKEN,
      ),
    ).resolves.toMatchObject({ githubLogin: 'ada' });
  });

  it('keeps the access token out of every log line', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, 401));

    await expect(adapter().fetchIdentity(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );

    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});

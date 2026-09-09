import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../../config/env';
import { AppError, ServiceUnavailableError } from '../../../http/errors';
import type { GithubIdentity } from '../github-identity.port';
import { DEFAULT_MOCK_LOGIN, MockGithubIdentityAdapter } from './mock-github-identity';

const env = { APP_URL: 'http://127.0.0.1:3000' } as unknown as AppEnv;

function adapter(): MockGithubIdentityAdapter {
  return new MockGithubIdentityAdapter({ env });
}

/** The whole flow, as the start route and the callback route will drive it. */
async function signIn(login?: string): Promise<GithubIdentity> {
  const port = adapter();
  const start = login === undefined ? { state: 's' } : { state: 's', login };
  const url = new URL(port.authorizeUrl(start));
  const code = url.searchParams.get('code') as string;
  return port.fetchIdentity(await port.exchangeCode(code));
}

describe('authorizeUrl', () => {
  it('bounces the browser straight back to the callback instead of github.com', async () => {
    const url = new URL(adapter().authorizeUrl({ state: 'state-token' }));

    // Same origin as the app, so CI completes a sign-in with no network call at all.
    expect(url.origin).toBe('http://127.0.0.1:3000');
    expect(url.pathname).toBe('/api/auth/github/callback');
  });

  it('carries the state through unchanged', async () => {
    // The callback compares `?state` against the state cookie before anything else. The
    // mock stands in for GitHub, never for the login-CSRF defence.
    const url = new URL(adapter().authorizeUrl({ state: 'signed-state-token' }));

    expect(url.searchParams.get('state')).toBe('signed-state-token');
  });

  it('encodes the requested login into the code it mints', async () => {
    const url = new URL(adapter().authorizeUrl({ state: 's', login: 'mock-operator' }));

    expect(url.searchParams.get('code')).toBe('mock-code-mock-operator');
  });

  it('falls back to the seeded mentee when no login was asked for', async () => {
    const url = new URL(adapter().authorizeUrl({ state: 's' }));

    expect(DEFAULT_MOCK_LOGIN).toBe('mock-mentee');
    expect(url.searchParams.get('code')).toBe('mock-code-mock-mentee');
  });
});

describe('the personas it mints', () => {
  it('derives the whole identity from the login hint', async () => {
    await expect(signIn('mock-operator')).resolves.toEqual({
      githubId: 'mock-mock-operator',
      githubLogin: 'mock-operator',
      // `<login>@devmentor.test`, which is exactly the address the seeder gives that
      // persona — so the sign-in links to the seeded row rather than creating a second one.
      email: 'mock-operator@devmentor.test',
      displayName: 'Mock Operator',
      avatarUrl: null,
    });
  });

  it('signs in as the seeded mentee when the flow carries no hint', async () => {
    await expect(signIn()).resolves.toMatchObject({
      githubLogin: 'mock-mentee',
      email: 'mock-mentee@devmentor.test',
      displayName: 'Mock Mentee',
    });
  });

  it('gives the same login the same identity every time', async () => {
    // Stability is what makes a second sign-in match on `github_id` instead of creating a
    // second account, and what lets a scenario assert on a name it did not create.
    const [first, second] = await Promise.all([signIn('mock-mentor'), signIn('mock-mentor')]);

    expect(second).toEqual(first);
  });

  it('gives two logins two different identities', async () => {
    const mentee = await signIn('mock-mentee');
    const operator = await signIn('mock-operator');

    // Every distinguishing field differs: one fixed identity could not run the
    // mentee-landing and operator scenarios in the same suite, because `operator`
    // authority is derived live from `OPERATOR_EMAILS`.
    expect(operator.githubId).not.toBe(mentee.githubId);
    expect(operator.email).not.toBe(mentee.email);
    expect(operator.githubLogin).not.toBe(mentee.githubLogin);
  });

  it('mints an id no real GitHub account can hold', async () => {
    // Real ids are decimal numbers. A test database that later meets the real adapter can
    // therefore never hand a real user one of these rows.
    const identity = await signIn('mock-mentor');

    expect(identity.githubId).toBe('mock-mock-mentor');
    expect(identity.githubId).not.toMatch(/^\d+$/);
  });

  it('cannot produce the address of the seeded admin fixture', async () => {
    // Ada is deliberately unreachable: `ada@devmentor.dev` is not `<login>@devmentor.test`
    // and `users.email` is never rewritten, so the admin-list assertions stay stable.
    const identity = await signIn('ada');

    expect(identity.email).toBe('ada@devmentor.test');
    expect(identity.email).not.toBe('ada@devmentor.dev');
  });

  it('titles a single-word login too', async () => {
    await expect(signIn('ada')).resolves.toMatchObject({ displayName: 'Ada' });
  });
});

describe('the values it refuses', () => {
  it('refuses an authorization code it did not mint', async () => {
    // The one way to reach this adapter with a foreign value is a hand-written callback
    // URL. Decoding it would sign that caller in as an account of their choosing.
    const error = await adapter()
      .exchangeCode('mock-operator')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).status).toBe(503);
    expect((error as AppError).message).toContain('authorization code');
  });

  it('refuses a code that is the prefix and nothing else', async () => {
    await expect(adapter().exchangeCode('mock-code-')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it('refuses an access token it did not mint', async () => {
    const error = await adapter()
      .fetchIdentity('mock-code-mock-operator')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).message).toContain('access token');
  });

  it('refuses an empty access token', async () => {
    await expect(adapter().fetchIdentity('')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('fails the same way the real adapter does, so the callback needs no branch', async () => {
    // A 503 is what a real token-exchange failure produces too, which is the point: the
    // route has one failure path and no knowledge of which adapter is registered.
    await expect(adapter().exchangeCode('not-mine')).rejects.toMatchObject({
      code: 'service_unavailable',
    });
  });
});

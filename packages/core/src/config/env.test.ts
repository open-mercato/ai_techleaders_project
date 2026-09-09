import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getEnv` memoises into a module-level `let`, so every case needs a fresh copy of the
 * module. `env.ts` imports nothing but `zod`, which is why resetting the registry is
 * affordable here and is not in `packages/db/src/config.test.ts` — see the 2026-09-03
 * lesson about `vi.resetModules()` and the MikroORM graph.
 */
async function loadGetEnv() {
  vi.resetModules();
  const { getEnv } = await import('./env');
  // `NodeJS.ProcessEnv` is globally augmented to make `NODE_ENV` required, but the
  // point of most cases here is an environment that sets *nothing*. The schema only
  // ever indexes the object, so the looser record is the honest input type for a test.
  return getEnv as (raw?: RawEnv) => ReturnType<typeof getEnv>;
}

type RawEnv = Record<string, string | undefined>;

/** Parse `raw` through a module instance whose cache is guaranteed to be empty. */
async function parseEnv(raw: RawEnv) {
  const getEnv = await loadGetEnv();
  return getEnv(raw);
}

/** Assert that `raw` is refused, and hand the message back for inspection. */
async function expectRejected(raw: RawEnv): Promise<string> {
  const getEnv = await loadGetEnv();
  try {
    getEnv(raw);
  } catch (error) {
    return String(error);
  }
  throw new Error('expected the environment to be rejected, but it parsed');
}

/**
 * What a real deployment looks like: production, a valid secret, real credentials. The
 * dangerous-adapter cases below start from this so they prove the schema refuses a
 * fake adapter in the shape of environment that would actually serve users.
 */
const PRODUCTION_ENV: RawEnv = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'a'.repeat(32),
  APP_URL: 'https://devmentor.example.com',
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  MAIL_API_KEY: 'mail-key',
  MAIL_FROM: 'DevMentor <hello@devmentor.example.com>',
};

describe('getEnv', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('parses an empty environment into the documented defaults', async () => {
    const env = await parseEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      APP_NAME: 'DevMentor',
      LOG_LEVEL: 'info',
      APP_URL: 'http://localhost:3000',
      OPERATOR_EMAILS: [],
      TRUSTED_PROXY_HOPS: 0,
      INTEGRATION_TEST_RUN: false,
    });
  });

  it('leaves every credential absent rather than inventing one', async () => {
    // B6: missing integration credentials fail closed at the route, so an environment
    // that sets none of them must still parse — this is what CI's Build job runs with.
    const env = await parseEnv({});

    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.SESSION_SECRET_PREVIOUS).toBeUndefined();
    expect(env.GITHUB_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_CLIENT_SECRET).toBeUndefined();
    expect(env.AUTH_IDENTITY_ADAPTER).toBeUndefined();
    expect(env.MAILER_ADAPTER).toBeUndefined();
    expect(env.MAIL_API_KEY).toBeUndefined();
    expect(env.MAIL_FROM).toBeUndefined();
  });

  it('keeps a session secret of at least 32 characters', async () => {
    const env = await parseEnv({ SESSION_SECRET: 'b'.repeat(32) });

    expect(env.SESSION_SECRET).toBe('b'.repeat(32));
  });

  it('rejects a session secret that is too short to be an HMAC key', async () => {
    const message = await expectRejected({ SESSION_SECRET: 'b'.repeat(31) });

    expect(message).toContain('SESSION_SECRET');
  });

  it('rejects a too-short previous session secret as well', async () => {
    const message = await expectRejected({ SESSION_SECRET_PREVIOUS: 'short' });

    expect(message).toContain('SESSION_SECRET_PREVIOUS');
  });

  it('splits the operator allowlist, trimming and case-folding every entry', async () => {
    const env = await parseEnv({
      OPERATOR_EMAILS: '  Ada@DevMentor.test , grace@devmentor.test ,, ',
    });

    expect(env.OPERATOR_EMAILS).toEqual(['ada@devmentor.test', 'grace@devmentor.test']);
  });

  it('treats only the literal 1 as the integration-run signal', async () => {
    await expect(parseEnv({ INTEGRATION_TEST_RUN: '1' })).resolves.toMatchObject({
      INTEGRATION_TEST_RUN: true,
    });
    await expect(parseEnv({ INTEGRATION_TEST_RUN: '0' })).resolves.toMatchObject({
      INTEGRATION_TEST_RUN: false,
    });
    await expect(parseEnv({ INTEGRATION_TEST_RUN: 'true' })).resolves.toMatchObject({
      INTEGRATION_TEST_RUN: false,
    });
  });

  it('coerces the proxy hop count and rejects a negative one', async () => {
    const env = await parseEnv({ TRUSTED_PROXY_HOPS: '2' });
    expect(env.TRUSTED_PROXY_HOPS).toBe(2);

    expect(await expectRejected({ TRUSTED_PROXY_HOPS: '-1' })).toContain('TRUSTED_PROXY_HOPS');
  });

  it('accepts an http or https APP_URL', async () => {
    await expect(parseEnv({ APP_URL: 'https://devmentor.example.com' })).resolves.toMatchObject({
      APP_URL: 'https://devmentor.example.com',
    });
  });

  it('rejects an APP_URL that is not an http(s) origin', async () => {
    // `localhost:3000` parses as a URL with the scheme `localhost:`, so the protocol
    // has to be pinned or a missing `http://` slips through.
    expect(await expectRejected({ APP_URL: 'localhost:3000' })).toContain('APP_URL');
    expect(await expectRejected({ APP_URL: 'ftp://devmentor.example.com' })).toContain('APP_URL');
  });

  it('rejects an adapter name it does not know', async () => {
    expect(await expectRejected({ AUTH_IDENTITY_ADAPTER: 'gitlab' })).toContain(
      'AUTH_IDENTITY_ADAPTER',
    );
    expect(await expectRejected({ MAILER_ADAPTER: 'smtp' })).toContain('MAILER_ADAPTER');
  });

  it('refuses the mock identity adapter without the integration-run signal', async () => {
    const message = await expectRejected({
      ...PRODUCTION_ENV,
      AUTH_IDENTITY_ADAPTER: 'mock',
    });

    expect(message).toContain('AUTH_IDENTITY_ADAPTER');
    expect(message).toContain('INTEGRATION_TEST_RUN=1');
  });

  it('refuses the log mailer without the integration-run signal', async () => {
    const message = await expectRejected({ ...PRODUCTION_ENV, MAILER_ADAPTER: 'log' });

    expect(message).toContain('MAILER_ADAPTER');
    expect(message).toContain('INTEGRATION_TEST_RUN=1');
  });

  it('reports both fake adapters at once', async () => {
    const message = await expectRejected({
      ...PRODUCTION_ENV,
      AUTH_IDENTITY_ADAPTER: 'mock',
      MAILER_ADAPTER: 'log',
    });

    expect(message).toContain('AUTH_IDENTITY_ADAPTER');
    expect(message).toContain('MAILER_ADAPTER');
  });

  it('is not fooled by a non-1 integration-run value', async () => {
    // `INTEGRATION_TEST_RUN=true` is not the signal, so the mock is still refused.
    const message = await expectRejected({
      ...PRODUCTION_ENV,
      AUTH_IDENTITY_ADAPTER: 'mock',
      INTEGRATION_TEST_RUN: 'true',
    });

    expect(message).toContain('AUTH_IDENTITY_ADAPTER');
  });

  it('allows both fakes together when the integration-run signal is set', async () => {
    const env = await parseEnv({
      ...PRODUCTION_ENV,
      AUTH_IDENTITY_ADAPTER: 'mock',
      MAILER_ADAPTER: 'log',
      INTEGRATION_TEST_RUN: '1',
    });

    expect(env.AUTH_IDENTITY_ADAPTER).toBe('mock');
    expect(env.MAILER_ADAPTER).toBe('log');
    expect(env.INTEGRATION_TEST_RUN).toBe(true);
  });

  it('accepts the real adapters without any test signal', async () => {
    const env = await parseEnv({
      ...PRODUCTION_ENV,
      AUTH_IDENTITY_ADAPTER: 'github',
      MAILER_ADAPTER: 'resend',
    });

    expect(env.AUTH_IDENTITY_ADAPTER).toBe('github');
    expect(env.MAILER_ADAPTER).toBe('resend');
  });

  it('parses once and returns the memoised value afterwards', async () => {
    const getEnv = await loadGetEnv();

    const first = getEnv({ APP_NAME: 'First' });
    // A second call with a different environment must not re-parse — the cache-hit
    // branch is what keeps `getEnv()` cheap on every call site in the app.
    const second = getEnv({ APP_NAME: 'Second' });

    expect(first.APP_NAME).toBe('First');
    expect(second).toBe(first);
  });

  it('defaults to reading process.env', async () => {
    vi.stubEnv('APP_NAME', 'FromProcessEnv');
    try {
      const getEnv = await loadGetEnv();
      expect(getEnv().APP_NAME).toBe('FromProcessEnv');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

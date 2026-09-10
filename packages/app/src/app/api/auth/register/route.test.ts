import {
  ConflictError,
  ServiceUnavailableError,
  TooManyRequestsError,
  type ApiRouteContext,
  type Cradle,
} from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/auth/register`, invoked directly.
 *
 * The container is the only thing stubbed. `apiHandler` (and therefore the CSRF check and
 * the error-to-envelope mapping), `registerSchema` and `parseJsonBody` are the real
 * implementations, because the composition *is* what this route is: which body it accepts,
 * what it derives from the request that the service cannot, and — the property with teeth —
 * that a successful registration answers an address and **no cookie**.
 */
const container = vi.hoisted(() => ({
  withScope: vi.fn(),
  registerWithPassword: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@devmentor/core')>();
  return { ...core, withScope: container.withScope };
});

const route = await import('./route');

const context = { params: Promise.resolve({}) } as ApiRouteContext;

const VALID_BODY = {
  email: 'ada@devmentor.test',
  password: 'a-long-enough-password',
  displayName: 'Ada Lovelace',
};

/** How many proxy hops the stubbed env trusts, so a test can turn IP derivation on and off. */
let trustedProxyHops: number;

function register(
  body: unknown,
  {
    query = '',
    headers = {},
    csrf = true,
  }: { query?: string; headers?: Record<string, string>; csrf?: boolean } = {},
): Promise<Response> {
  return route.POST(
    new Request(`http://devmentor.test/api/auth/register${query}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-devmentor-request': '1' } : {}),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    context,
  );
}

async function envelope(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** The input the service was called with, which most assertions here are about. */
function registrationInput(): Record<string, unknown> {
  expect(container.registerWithPassword).toHaveBeenCalledTimes(1);
  return container.registerWithPassword.mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  trustedProxyHops = 1;
  container.registerWithPassword.mockImplementation(
    ({ email }: { email: string }) => Promise.resolve({ email }),
  );
  container.withScope.mockImplementation((fn: (cradle: Cradle) => unknown) =>
    Promise.resolve().then(() =>
      fn({
        env: { TRUSTED_PROXY_HOPS: trustedProxyHops },
        logger: { warn: container.warn },
        userService: { registerWithPassword: container.registerWithPassword },
      } as unknown as Cradle),
    ),
  );
});

describe('/api/auth/register route shape', () => {
  it('exports POST and force-dynamic, and nothing else', () => {
    // No `GET`: a link or a prefetch must not be able to fire a registration, and Next
    // answers 405 for a verb the module does not export.
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});

describe('a successful registration', () => {
  it('answers the address and sets no cookie', async () => {
    const response = await register(VALID_BODY);

    expect(response.status).toBe(200);
    expect(await envelope(response)).toEqual({
      ok: true,
      data: { email: 'ada@devmentor.test' },
    });
    // The contract, not an implementation detail: `email_verified_at` gates sign-in, so a
    // registration that handed out a session would authenticate an address nobody has proven.
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('passes the schema-parsed body straight to the service', async () => {
    await register({ ...VALID_BODY, roles: ['operator'], id: 'chosen-by-caller' });

    // `roles` and `id` are gone: unknown keys are dropped by the schema before the service
    // sees them, which is what keeps this route off the mass-assignment list.
    expect(registrationInput()).toEqual({
      email: 'ada@devmentor.test',
      password: 'a-long-enough-password',
      displayName: 'Ada Lovelace',
      returnTo: null,
      clientIp: null,
    });
  });
});

describe('the client IP the service cannot derive for itself', () => {
  it('takes the address Nth-from-right per TRUSTED_PROXY_HOPS', async () => {
    await register(VALID_BODY, {
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.4, 10.0.0.1' },
    });

    expect(registrationInput().clientIp).toBe('10.0.0.1');
  });

  it('trusts two hops when configured to', async () => {
    trustedProxyHops = 2;
    await register(VALID_BODY, {
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.4, 10.0.0.1' },
    });

    expect(registrationInput().clientIp).toBe('198.51.100.4');
  });

  it('registers with no IP rather than refusing when none is derivable', async () => {
    trustedProxyHops = 0;

    const response = await register(VALID_BODY);

    // Edge case 17b: the per-IP bucket is skipped and the request still succeeds. Refusing
    // would take the whole sign-up path down on a deployment behind no proxy.
    expect(response.status).toBe(200);
    expect(registrationInput().clientIp).toBeNull();
  });
});

describe('the ?returnTo the mailed link carries', () => {
  it('reads it from the query, which is how CrudForm sends it', async () => {
    await register(VALID_BODY, { query: '?returnTo=%2Fmentors%2Fada' });

    expect(registrationInput().returnTo).toBe('/mentors/ada');
  });

  it('prefers the body, which is the contract', async () => {
    await register(
      { ...VALID_BODY, returnTo: '/from-body' },
      { query: '?returnTo=/from-query' },
    );

    expect(registrationInput().returnTo).toBe('/from-body');
  });

  it('passes a hostile value through untouched, for the service and the route to reject', async () => {
    // Not sanitised here on purpose: `safeReturnTo` runs where the link is built and again
    // when it is opened, so there is one place that decides, and it is not this one.
    await register(VALID_BODY, { query: '?returnTo=https%3A%2F%2Fevil.example' });

    expect(registrationInput().returnTo).toBe('https://evil.example');
  });
});

describe('refusals', () => {
  it('refuses a request without the CSRF header before the body is read', async () => {
    const response = await register(VALID_BODY, { csrf: false });

    expect(response.status).toBe(403);
    expect(await envelope(response)).toMatchObject({ error: { code: 'forbidden' } });
    expect(container.withScope).not.toHaveBeenCalled();
  });

  it('answers 422 with fieldErrors for a body the schema rejects', async () => {
    const response = await register({ email: 'not-an-address', password: 'short', displayName: '' });

    expect(response.status).toBe(422);
    expect(await envelope(response)).toMatchObject({
      ok: false,
      error: {
        code: 'validation_failed',
        fieldErrors: {
          email: [expect.any(String)],
          password: [expect.any(String)],
          displayName: [expect.any(String)],
        },
      },
    });
    // Nothing was hashed and no counter was charged: the body never reached the service.
    expect(container.registerWithPassword).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await register('{');

    expect(response.status).toBe(400);
    expect(await envelope(response)).toMatchObject({ error: { code: 'bad_request' } });
  });

  it.each([
    [new ConflictError('An account already exists for this email address.'), 409, 'conflict'],
    [new TooManyRequestsError(900), 429, 'rate_limited'],
    [new ServiceUnavailableError('Mail could not be delivered'), 503, 'service_unavailable'],
  ])('passes a %s from the service through as the envelope', async (error, status, code) => {
    container.registerWithPassword.mockRejectedValue(error);

    const response = await register(VALID_BODY);

    expect(response.status).toBe(status);
    expect(await envelope(response)).toMatchObject({ ok: false, error: { code } });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('carries Retry-After and retryAfterSeconds on a tripped rate limit', async () => {
    container.registerWithPassword.mockRejectedValue(new TooManyRequestsError(3600));

    const response = await register(VALID_BODY);

    // Both halves of the contract (§1): the header for an HTTP client, the envelope field
    // for the form, which cannot read headers off `apiCall`'s result.
    expect(response.headers.get('retry-after')).toBe('3600');
    expect(await envelope(response)).toMatchObject({
      error: { retryAfterSeconds: 3600 },
    });
  });
});

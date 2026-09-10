import {
  INVALID_CREDENTIALS_MESSAGE,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  type ApiRouteContext,
  type Cradle,
} from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/auth/login`, invoked directly, with the container as the only stub.
 *
 * Two properties carry this file. The first is that success sets the session cookie on the
 * envelope response — a route handler is the only thing in the App Router that can, so if it
 * is not done here it is not done at all. The second is the negative of it: **no refusal
 * sets a cookie**, whatever the reason, which is asserted per failure rather than inferred
 * from the happy path.
 */
const container = vi.hoisted(() => ({
  withScope: vi.fn(),
  authenticateWithPassword: vi.fn(),
  issue: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@devmentor/core')>();
  return { ...core, withScope: container.withScope };
});

const route = await import('./route');

const context = { params: Promise.resolve({}) } as ApiRouteContext;

const CREDENTIALS = { email: 'ada@devmentor.test', password: 'a-long-enough-password' };

const MENTEE = {
  id: 'user-1',
  email: 'ada@devmentor.test',
  displayName: 'Ada Lovelace',
  roles: ['mentee'],
  githubLogin: null,
  avatarUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  mentorProfile: null,
};

const SESSION_COOKIE =
  'devmentor_session=signed.session.jwt; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax';

let trustedProxyHops: number;

function login(
  body: unknown,
  { headers = {}, csrf = true }: { headers?: Record<string, string>; csrf?: boolean } = {},
): Promise<Response> {
  return route.POST(
    new Request('http://devmentor.test/api/auth/login', {
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

beforeEach(() => {
  vi.clearAllMocks();
  trustedProxyHops = 1;
  container.authenticateWithPassword.mockResolvedValue({ user: MENTEE, sessionVersion: 3 });
  container.issue.mockResolvedValue({ cookie: SESSION_COOKIE });
  container.withScope.mockImplementation((fn: (cradle: Cradle) => unknown) =>
    Promise.resolve().then(() =>
      fn({
        env: { TRUSTED_PROXY_HOPS: trustedProxyHops },
        logger: { warn: container.warn },
        sessionService: { issue: container.issue },
        userService: { authenticateWithPassword: container.authenticateWithPassword },
      } as unknown as Cradle),
    ),
  );
});

describe('/api/auth/login route shape', () => {
  it('exports POST and force-dynamic, and nothing else', () => {
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});

describe('a successful sign-in', () => {
  it('answers the user and sets the session cookie on the same response', async () => {
    const response = await login(CREDENTIALS);

    expect(response.status).toBe(200);
    expect(await envelope(response)).toEqual({ ok: true, data: MENTEE });
    expect(response.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('signs the cookie from the session version the service returned', async () => {
    await login(CREDENTIALS);

    // Not from a claim in whatever cookie the browser was already holding: the version is
    // read from the row in the same request that checked the credential.
    expect(container.issue).toHaveBeenCalledExactlyOnceWith({ id: 'user-1', sessionVersion: 3 });
  });

  it('sends the service the credential and the derived client IP, and nothing else', async () => {
    await login({ ...CREDENTIALS, returnTo: '/mentor', roles: ['operator'] }, {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });

    // `returnTo` is parsed by the shared schema and deliberately not forwarded — nothing
    // here redirects — and `roles` never survived the schema at all.
    expect(container.authenticateWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: 'ada@devmentor.test',
      password: 'a-long-enough-password',
      clientIp: '10.0.0.1',
    });
  });

  it('signs in with no client IP when none is derivable', async () => {
    trustedProxyHops = 0;

    const response = await login(CREDENTIALS);

    expect(response.status).toBe(200);
    expect(container.authenticateWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ clientIp: null }),
    );
  });
});

describe('refusals never set a cookie', () => {
  it('answers the one generic 401 for a wrong password or an unknown address', async () => {
    container.authenticateWithPassword.mockRejectedValue(
      new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE),
    );

    const response = await login(CREDENTIALS);

    expect(response.status).toBe(401);
    expect(await envelope(response)).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: INVALID_CREDENTIALS_MESSAGE },
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(container.issue).not.toHaveBeenCalled();
  });

  it('answers 429 with Retry-After and retryAfterSeconds when the limit trips', async () => {
    container.authenticateWithPassword.mockRejectedValue(new TooManyRequestsError(900));

    const response = await login(CREDENTIALS);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('900');
    expect(await envelope(response)).toMatchObject({
      error: { code: 'rate_limited', retryAfterSeconds: 900 },
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('answers 503 when the hashing gate is saturated', async () => {
    container.authenticateWithPassword.mockRejectedValue(new ServiceUnavailableError());

    const response = await login(CREDENTIALS);

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('refuses a request without the CSRF header before the credential is read', async () => {
    const response = await login(CREDENTIALS, { csrf: false });

    expect(response.status).toBe(403);
    expect(container.withScope).not.toHaveBeenCalled();
  });

  it('answers 422 with fieldErrors for a body the schema rejects', async () => {
    const response = await login({ email: 'not-an-address' });

    expect(response.status).toBe(422);
    expect(await envelope(response)).toMatchObject({
      error: {
        code: 'validation_failed',
        fieldErrors: { email: [expect.any(String)], password: [expect.any(String)] },
      },
    });
    expect(container.authenticateWithPassword).not.toHaveBeenCalled();
  });

  it('accepts a password below the register minimum, and lets the credential decide', async () => {
    // `loginSchema` has the byte cap and deliberately no `.min()`: a stored password set
    // under an older policy must still be typeable into the form that checks it.
    await login({ email: 'ada@devmentor.test', password: 'short' });

    expect(container.authenticateWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'short' }),
    );
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await login('{');

    expect(response.status).toBe(400);
    expect(await envelope(response)).toMatchObject({ error: { code: 'bad_request' } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiHandler,
  jsonError,
  jsonOk,
  type ApiRouteContext,
  type RouteLogic,
} from './apiHandler';
import { NotFoundError, ValidationError, type FieldErrors } from './errors';

const testState = vi.hoisted(() => ({
  error: vi.fn(),
  createLogger: vi.fn(),
}));

vi.mock('../logger', () => ({
  createLogger: testState.createLogger,
}));

const context = { params: Promise.resolve({}) } as ApiRouteContext;

function request(method = 'GET', headers?: Record<string, string>): Request {
  return new Request('http://devmentor.test/api/users', { method, headers });
}

/** A mutating request the way `apiCall` sends it: always carrying the CSRF header. */
function mutatingRequest(method = 'POST'): Request {
  return request(method, { 'x-devmentor-request': '1' });
}

function run(logic: RouteLogic): Promise<Response> {
  return apiHandler(logic)(request(), context);
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.createLogger.mockReturnValue({ error: testState.error });
});

describe('jsonOk', () => {
  it('wraps a payload in the success envelope with status 200 by default', async () => {
    const response = jsonOk({ id: '1' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true, data: { id: '1' } });
  });

  it('takes an explicit status, for a 201 on create', async () => {
    const response = jsonOk({ id: '1' }, 201);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { id: '1' } });
  });

  it('wraps null, which is a legitimate payload for a delete', async () => {
    expect(await jsonOk(null).json()).toEqual({ ok: true, data: null });
  });
});

describe('jsonError', () => {
  it('builds the failure envelope without field errors or extra headers', async () => {
    const response = jsonError(404, 'not_found', 'Resource not found');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'Resource not found' },
    });
  });

  it('includes field errors when they are given', async () => {
    const fieldErrors: FieldErrors = { email: ['Enter an email address'] };

    expect(await jsonError(422, 'validation_failed', 'Validation failed', fieldErrors).json()).toEqual(
      {
        ok: false,
        error: { code: 'validation_failed', message: 'Validation failed', fieldErrors },
      },
    );
  });

  it('copies extra headers onto the response', () => {
    const response = jsonError(429, 'rate_limited', 'Slow down', undefined, {
      'retry-after': '30',
    });

    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

describe('apiHandler', () => {
  it('wraps whatever the route logic returns', async () => {
    const response = await run(async () => [{ id: '1' }]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [{ id: '1' }] });
  });

  it('accepts synchronous route logic', async () => {
    expect(await (await run(() => 'pong')).json()).toEqual({ ok: true, data: 'pong' });
  });

  it('passes a Response the route built itself straight through', async () => {
    const redirect = new Response(null, { status: 302, headers: { location: '/home' } });

    const response = await run(() => redirect);

    expect(response).toBe(redirect);
    expect(response.status).toBe(302);
  });

  it('maps a thrown AppError to its status, code and message', async () => {
    const response = await run(() => {
      throw new NotFoundError('No such user');
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'No such user' },
    });
    expect(testState.createLogger).not.toHaveBeenCalled();
  });

  it('carries an AppError’s field errors into the envelope', async () => {
    const response = await run(() => {
      throw new ValidationError('Check the form', { email: ['Required'] });
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Check the form',
        fieldErrors: { email: ['Required'] },
      },
    });
  });

  it('turns an unexpected error into a generic 500 and logs it', async () => {
    const failure = new Error('connection terminated unexpectedly');

    const response = await run(() => {
      throw failure;
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'internal_error', message: 'Something went wrong' },
    });
    expect(testState.error).toHaveBeenCalledWith(
      { err: failure, path: '/api/users' },
      'unhandled route error',
    );
  });

  it('logs the route path only, never the query string that carries the credentials', async () => {
    // Regression, found in review. `req.url` is the *full* URL: on
    // `/api/auth/github/callback` the query holds the GitHub authorization code and the
    // signed state token, and on `/api/auth/verify-email` a purpose token. Logging it
    // wrote live credentials to the log on any unexpected failure of those routes.
    //
    // pino's `redact` is no defence here — it matches key *names*, and a secret inside a
    // URL string is not a key. The query has to be dropped at this call site.
    const failure = new Error('token exchange failed');

    const response = await apiHandler(() => {
      throw failure;
    })(
      new Request(
        'http://devmentor.test/api/auth/github/callback?code=SECRET_CODE&state=SECRET_STATE',
      ),
      context,
    );

    expect(response.status).toBe(500);
    // The route is still identifiable — this is not "log nothing".
    expect(testState.error).toHaveBeenCalledWith(
      { err: failure, path: '/api/auth/github/callback' },
      'unhandled route error',
    );

    const logged = JSON.stringify(testState.error.mock.calls);
    expect(logged).not.toContain('SECRET_CODE');
    expect(logged).not.toContain('SECRET_STATE');
    expect(logged).not.toContain('code=');
  });

  it('leaks no detail of the unexpected error to the client', async () => {
    const response = await run(() => {
      throw new Error('password=hunter2 at /home/app/secret.ts');
    });

    expect(await response.text()).not.toContain('hunter2');
  });

  it('refuses a POST that does not carry the CSRF header, before the route runs', async () => {
    // Edge case 23. The refusal must happen ahead of the logic, not inside it: a plain
    // cross-site HTML form post cannot set the header, and this is the line that makes
    // that fact protective for *every* mutating route rather than the ones that remembered.
    const logic = vi.fn();

    const response = await apiHandler(logic)(request('POST'), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(logic).not.toHaveBeenCalled();
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('refuses a bare %s the same way', async (method) => {
    const response = await apiHandler(async () => 'ran')(request(method), context);

    expect(response.status).toBe(403);
  });

  it('runs a mutating request that carries the header', async () => {
    const response = await apiHandler(async () => 'created')(mutatingRequest(), context);

    expect(await response.json()).toEqual({ ok: true, data: 'created' });
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through without the header',
    async (method) => {
      const response = await apiHandler(async () => 'read')(request(method), context);

      expect(response.status).toBe(200);
    },
  );

  it('enforces the check when an options bag is passed without a csrf key', async () => {
    const response = await apiHandler(async () => 'ran', {})(request('POST'), context);

    expect(response.status).toBe(403);
  });

  it('enforces the check when csrf is set explicitly', async () => {
    const response = await apiHandler(async () => 'ran', { csrf: true })(
      request('POST'),
      context,
    );

    expect(response.status).toBe(403);
  });

  it('honours { csrf: false }, the webhook opt-out', async () => {
    // Reserved for the E04 payment webhook, which is called by the provider rather than a
    // browser and authenticates by verifying a request signature instead.
    const response = await apiHandler(async () => 'ran', { csrf: false })(
      request('POST'),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: 'ran' });
  });

  it('creates the logger once and reuses it across requests', async () => {
    // A fresh module instance, so the module-level logger cache starts empty here
    // regardless of the tests above.
    vi.resetModules();
    const fresh = await import('./apiHandler');
    const failing = () => {
      throw new Error('boom');
    };

    await fresh.apiHandler(failing)(request(), context);
    await fresh.apiHandler(failing)(request(), context);

    expect(testState.error).toHaveBeenCalledTimes(2);
    expect(testState.createLogger).toHaveBeenCalledTimes(1);
  });
});

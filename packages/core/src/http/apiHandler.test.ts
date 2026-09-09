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

function request(method = 'GET'): Request {
  return new Request('http://devmentor.test/api/users', { method });
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
      { err: failure, path: 'http://devmentor.test/api/users' },
      'unhandled route error',
    );
  });

  it('leaks no detail of the unexpected error to the client', async () => {
    const response = await run(() => {
      throw new Error('password=hunter2 at /home/app/secret.ts');
    });

    expect(await response.text()).not.toContain('hunter2');
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

import { describe, expect, it, vi } from 'vitest';
import { apiHandler, type ApiRouteContext } from './apiHandler';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RATE_LIMITED_MESSAGE,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  isAppError,
  type FieldErrors,
} from './errors';

const fieldErrors: FieldErrors = { email: ['Enter an email address'] };

describe('AppError', () => {
  it('carries the status, code and subclass name', () => {
    const error = new AppError('Teapot', 418, 'teapot');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Teapot');
    expect(error.status).toBe(418);
    expect(error.code).toBe('teapot');
    expect(error.name).toBe('AppError');
  });

  it('leaves the optional fields undefined when no options are passed', () => {
    const error = new AppError('Teapot', 418, 'teapot');

    expect(error.fieldErrors).toBeUndefined();
    expect(error.headers).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('leaves the optional fields undefined when an empty options bag is passed', () => {
    const error = new AppError('Teapot', 418, 'teapot', {});

    expect(error.fieldErrors).toBeUndefined();
    expect(error.headers).toBeUndefined();
    expect(error.retryAfterSeconds).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('keeps a cause when one is given', () => {
    const cause = new Error('underlying');
    const error = new AppError('Teapot', 418, 'teapot', { cause });

    expect(error.cause).toBe(cause);
  });

  it('accepts a falsy cause, which is still a cause', () => {
    const error = new AppError('Teapot', 418, 'teapot', { cause: null });

    expect(error.cause).toBeNull();
  });

  it('keeps field errors, headers and a retry hint when they are given', () => {
    const error = new AppError('Teapot', 418, 'teapot', {
      fieldErrors,
      headers: { 'retry-after': '30' },
      retryAfterSeconds: 30,
    });

    expect(error.fieldErrors).toEqual(fieldErrors);
    expect(error.headers).toEqual({ 'retry-after': '30' });
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('names itself after the concrete subclass', () => {
    class PaymentRequiredError extends AppError {
      constructor() {
        super('Payment required', 402, 'payment_required');
      }
    }

    expect(new PaymentRequiredError().name).toBe('PaymentRequiredError');
  });
});

describe('the error family', () => {
  it('maps BadRequestError to 400 with a default message', () => {
    const error = new BadRequestError();

    expect([error.status, error.code, error.message]).toEqual([400, 'bad_request', 'Bad request']);
  });

  it('lets BadRequestError take a message and a cause', () => {
    const cause = new SyntaxError('bad json');
    const error = new BadRequestError('Request body must be valid JSON', { cause });

    expect(error.message).toBe('Request body must be valid JSON');
    expect(error.cause).toBe(cause);
  });

  it('maps UnauthorizedError to 401 with a default message', () => {
    const error = new UnauthorizedError();

    expect([error.status, error.code, error.message]).toEqual([
      401,
      'unauthorized',
      'Authentication required',
    ]);
  });

  it('lets UnauthorizedError take a message', () => {
    expect(new UnauthorizedError('Invalid credentials').message).toBe('Invalid credentials');
  });

  it('maps ForbiddenError to 403 with a default message', () => {
    const error = new ForbiddenError();

    expect([error.status, error.code, error.message]).toEqual([
      403,
      'forbidden',
      'You do not have access to this resource',
    ]);
  });

  it('lets ForbiddenError take a message', () => {
    expect(new ForbiddenError('Operators only').message).toBe('Operators only');
  });

  it('maps NotFoundError to 404 with a default message', () => {
    const error = new NotFoundError();

    expect([error.status, error.code, error.message]).toEqual([
      404,
      'not_found',
      'Resource not found',
    ]);
  });

  it('lets NotFoundError take a message', () => {
    expect(new NotFoundError('No such mentor').message).toBe('No such mentor');
  });

  it('maps ConflictError to 409 with a default message', () => {
    const error = new ConflictError();

    expect([error.status, error.code, error.message]).toEqual([
      409,
      'conflict',
      'Conflict with the current state of the resource',
    ]);
  });

  it('lets ConflictError take a message', () => {
    expect(new ConflictError('That email already signs in with GitHub').message).toBe(
      'That email already signs in with GitHub',
    );
  });

  it('maps ValidationError to 422 with a default message and no field errors', () => {
    const error = new ValidationError();

    expect([error.status, error.code, error.message]).toEqual([
      422,
      'validation_failed',
      'Validation failed',
    ]);
    expect(error.fieldErrors).toBeUndefined();
  });

  it('lets ValidationError carry a message and field errors', () => {
    const error = new ValidationError('Check the form', fieldErrors);

    expect(error.message).toBe('Check the form');
    expect(error.fieldErrors).toEqual(fieldErrors);
  });
});

describe('ServiceUnavailableError', () => {
  it('is a 503 with the code the API contract names', () => {
    const error = new ServiceUnavailableError();

    expect(error.status).toBe(503);
    expect(error.code).toBe('service_unavailable');
    expect(error.name).toBe('ServiceUnavailableError');
    expect(isAppError(error)).toBe(true);
  });

  it('defaults to an honest, retryable message', () => {
    expect(new ServiceUnavailableError().message).toBe(
      'This part of the service is temporarily unavailable. Please try again.',
    );
  });

  it('takes a call-site message', () => {
    expect(new ServiceUnavailableError('Sign-in with GitHub is not configured').message).toBe(
      'Sign-in with GitHub is not configured',
    );
  });

  it('carries the upstream failure as a cause the client never sees', () => {
    const cause = new Error('GET https://api.github.com/user responded with 500');
    const error = new ServiceUnavailableError(undefined, { cause });

    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain('github');
  });

  it('can carry headers', () => {
    const error = new ServiceUnavailableError(undefined, { headers: { 'retry-after': '5' } });

    expect(error.headers).toEqual({ 'retry-after': '5' });
  });
});

describe('TooManyRequestsError', () => {
  it('is a 429 with the code the API contract names', () => {
    const error = new TooManyRequestsError(240);

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(error.name).toBe('TooManyRequestsError');
  });

  it('carries the retry hint in the envelope field and in the header', () => {
    const error = new TooManyRequestsError(240);

    expect(error.retryAfterSeconds).toBe(240);
    expect(error.headers).toEqual({ 'Retry-After': '240' });
  });

  it('says nothing about which bucket ran out or whether the account exists', () => {
    // Edge case 17: the refusal a stuffer sees for `nobody@example.com` and the one a
    // real user sees for their own address have to be the same sentence, or the limiter
    // becomes the enumeration oracle the identical 401 exists to close.
    const unknownAddress = new TooManyRequestsError(900);
    const realAddress = new TooManyRequestsError(60);

    expect(unknownAddress.message).toBe(realAddress.message);
    expect(unknownAddress.message).toBe(RATE_LIMITED_MESSAGE);
    expect(unknownAddress.message).not.toMatch(/email|address|ip|account|attempt limit/i);
  });

  it('takes a call-site message for a bucket whose refusal is a different fact', () => {
    const error = new TooManyRequestsError(30, 'This invitation batch is throttled.');

    expect(error.message).toBe('This invitation batch is throttled.');
    expect(error.retryAfterSeconds).toBe(30);
  });
});

describe('isAppError', () => {
  it('accepts every member of the family', () => {
    expect(
      [
        new AppError('x', 418, 'teapot'),
        new BadRequestError(),
        new UnauthorizedError(),
        new ForbiddenError(),
        new NotFoundError(),
        new ConflictError(),
        new ValidationError(),
        new TooManyRequestsError(1),
        new ServiceUnavailableError(),
      ].every(isAppError),
    ).toBe(true);
  });

  it('rejects a plain Error, a non-error value and undefined', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError({ status: 400, code: 'bad_request' })).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });

  it('rejects a plain object wearing the brand, which has no stack to report', () => {
    expect(isAppError({ [Symbol.for('devmentor.http.app-error')]: true })).toBe(false);
  });

  // REGRESSION (2026-09-10). Next evaluates `@devmentor/core` once per module graph, and
  // `getContainer()` caches the container on `globalThis` — so whichever graph builds it
  // first owns every service, and a route handler in the *other* graph receives errors built
  // from a different copy of this module. `isAppError` used to be `instanceof AppError`,
  // which answered `false`: `apiHandler` reported a deliberate `401 unauthorized` from
  // `authenticateWithPassword` as `500 internal_error`, and whether it happened at all
  // depended on the order of the first two requests after a boot. Resetting the registry and
  // re-importing is that second copy, in the one place a unit test can produce it.
  it('recognises errors built by a second copy of this module', async () => {
    vi.resetModules();
    const second = await import('./errors');

    expect(second.AppError).not.toBe(AppError);
    expect(second.UnauthorizedError).not.toBe(UnauthorizedError);
    // Neither direction may depend on which copy constructed the value.
    expect(isAppError(new second.UnauthorizedError())).toBe(true);
    expect(second.isAppError(new UnauthorizedError())).toBe(true);
    expect(new second.ConflictError() instanceof ConflictError).toBe(false);
    // And `code` is what a caller discriminates on instead, because a string crosses intact.
    expect(new second.ConflictError().code).toBe(new ConflictError().code);
  });
});

describe('AppError.headers round-trip through apiHandler', () => {
  const context = { params: Promise.resolve({}) } as ApiRouteContext;
  // The CSRF header is required on a POST (primitives B3); without it `apiHandler` refuses
  // with a 403 before the logic under test throws anything.
  const request = new Request('http://devmentor.test/api/auth/login', {
    method: 'POST',
    headers: { 'x-devmentor-request': '1' },
  });

  it('copies the headers onto the failure response and keeps the envelope', async () => {
    const handler = apiHandler(() => {
      throw new AppError('Slow down', 429, 'rate_limited', {
        headers: { 'retry-after': '30', 'x-devmentor-window': '900' },
      });
    });

    const response = await handler(request, context);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('x-devmentor-window')).toBe('900');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'rate_limited', message: 'Slow down' },
    });
  });

  it('sends no extra headers when the error carries none', async () => {
    const handler = apiHandler(() => {
      throw new ServiceUnavailableError();
    });

    const response = await handler(request, context);

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    expect([...response.headers.keys()]).toEqual(['content-type']);
  });

  it('puts a rate-limit refusal in the envelope and the header at once', async () => {
    const handler = apiHandler(() => {
      throw new TooManyRequestsError(240);
    });

    const response = await handler(request, context);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('240');
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: RATE_LIMITED_MESSAGE,
        retryAfterSeconds: 240,
      },
    });
  });

  it('omits retryAfterSeconds from an envelope whose error does not carry one', async () => {
    const handler = apiHandler(() => {
      throw new NotFoundError();
    });

    const body = (await (await handler(request, context)).json()) as {
      error: Record<string, unknown>;
    };

    expect(Object.keys(body.error)).toEqual(['code', 'message']);
  });

  it('never lets an error header change the envelope media type', async () => {
    const handler = apiHandler(() => {
      throw new AppError('Nope', 400, 'bad_request', {
        headers: { 'content-type': 'text/html' },
      });
    });

    const response = await handler(request, context);

    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

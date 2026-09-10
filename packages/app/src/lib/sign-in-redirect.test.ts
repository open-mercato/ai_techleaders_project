import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logging = vi.hoisted(() => ({ error: vi.fn(), createLogger: vi.fn() }));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  createLogger: logging.createLogger,
}));

const { redirectTo, signInCancelled, signInError, signInErrorCodeFor } = await import(
  './sign-in-redirect'
);

/** Every `Set-Cookie` on a response, which `Headers.get` would have joined into one string. */
function cookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

beforeEach(() => {
  vi.clearAllMocks();
  logging.createLogger.mockReturnValue({ error: logging.error });
});

describe('redirectTo', () => {
  it('builds a 302 with an empty body and a Location header', async () => {
    const response = redirectTo('/home');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/home');
    await expect(response.text()).resolves.toBe('');
  });

  it('carries Set-Cookie, which Response.redirect() cannot', () => {
    // The 2026-09-04 lesson: `Response.redirect()` returns immutable headers, so the
    // session cookie would be silently dropped.
    expect(cookies(redirectTo('/home', ['devmentor_session=s; Path=/']))).toEqual([
      'devmentor_session=s; Path=/',
    ]);
  });

  it('appends rather than sets, so two cookies survive as two headers', () => {
    expect(cookies(redirectTo('/home', ['a=1; Path=/', 'b=2; Path=/']))).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
  });

  it('sets no cookie when none was given', () => {
    expect(cookies(redirectTo('/sign-in'))).toEqual([]);
  });
});

describe('signInError / signInCancelled', () => {
  it.each(['state', 'unavailable', 'verification', 'email'] as const)(
    'redirects to /sign-in?error=%s',
    (code) => {
      expect(signInError(code).headers.get('location')).toBe(`/sign-in?error=${code}`);
    },
  );

  it('reports a cancelled authorisation as ?cancelled=1, not as an error', () => {
    expect(signInCancelled().headers.get('location')).toBe('/sign-in?cancelled=1');
  });

  it('carries the cookies it was handed', () => {
    expect(cookies(signInError('state', ['x=; Max-Age=0']))).toEqual(['x=; Max-Age=0']);
    expect(cookies(signInCancelled(['x=; Max-Age=0']))).toEqual(['x=; Max-Age=0']);
  });
});

describe('signInErrorCodeFor', () => {
  it('maps a ConflictError to the email vocabulary, silently', () => {
    // Both 409s in this flow — GitHub has no verified primary address (edge case 3), and
    // the address matches an unconfirmed account (edge case 4) — are expected refusals the
    // user can act on, not failures worth logging.
    expect(signInErrorCodeFor(new ConflictError('no verified email'), '/x')).toBe('email');
    expect(logging.createLogger).not.toHaveBeenCalled();
  });

  it('maps any other AppError to unavailable without logging it', () => {
    expect(signInErrorCodeFor(new ServiceUnavailableError(), '/x')).toBe('unavailable');
    expect(signInErrorCodeFor(new NotFoundError(), '/x')).toBe('unavailable');
    expect(logging.createLogger).not.toHaveBeenCalled();
  });

  it('logs an unexpected failure and still answers unavailable', () => {
    const failure = new Error('the database went away');

    expect(signInErrorCodeFor(failure, '/api/auth/github/callback')).toBe('unavailable');
    expect(logging.error).toHaveBeenCalledWith(
      { err: failure, route: '/api/auth/github/callback' },
      'unhandled failure in the GitHub sign-in flow',
    );
  });

  it('logs a thrown non-Error too, rather than assuming an Error was thrown', () => {
    expect(signInErrorCodeFor('a string', '/x')).toBe('unavailable');
    expect(logging.error).toHaveBeenCalledWith(
      { err: 'a string', route: '/x' },
      'unhandled failure in the GitHub sign-in flow',
    );
  });
});

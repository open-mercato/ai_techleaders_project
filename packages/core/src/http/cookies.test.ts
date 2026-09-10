import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../config/env';
import { readCookie, serializeCookie, type CookieEnv } from './cookies';

/**
 * The serializer is shared by the session cookie (B2) and the OAuth `state` cookie, so the
 * attribute list is asserted here once and neither consumer restates it. Two attributes
 * are load-bearing rather than cosmetic: `SameSite=Lax` (a `Strict` state cookie is not
 * sent on the cross-site callback navigation and fails every sign-in — 2026-09-04 lesson)
 * and `Secure` only in production (an unconditional one makes local sign-in impossible).
 */
function env(NODE_ENV: AppEnv['NODE_ENV']): CookieEnv {
  return { NODE_ENV };
}

function attributes(cookie: string): string[] {
  return cookie.split('; ');
}

function requestWith(header: string | null): Request {
  return new Request('http://devmentor.test/api/auth/github/callback', {
    headers: header === null ? {} : { cookie: header },
  });
}

describe('serializeCookie', () => {
  it('writes the name, the value and the five shared attributes', () => {
    const cookie = serializeCookie({
      name: 'devmentor_session',
      value: 'a.signed.jwt',
      maxAgeSeconds: 86_400,
      env: env('development'),
    });

    expect(attributes(cookie)).toEqual([
      'devmentor_session=a.signed.jwt',
      'Path=/',
      'Max-Age=86400',
      'HttpOnly',
      'SameSite=Lax',
    ]);
  });

  it('never writes SameSite=Strict, which the OAuth callback would never receive', () => {
    const cookie = serializeCookie({
      name: 'devmentor_oauth_state',
      value: 'state.token',
      maxAgeSeconds: 600,
      env: env('production'),
    });

    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Strict');
  });

  it.each(['development', 'test'] as const)('omits Secure in %s', (nodeEnv) => {
    expect(
      serializeCookie({ name: 'c', value: 'v', maxAgeSeconds: 1, env: env(nodeEnv) }),
    ).not.toContain('Secure');
  });

  it('adds Secure in production, last', () => {
    const cookie = serializeCookie({
      name: 'c',
      value: 'v',
      maxAgeSeconds: 1,
      env: env('production'),
    });

    expect(attributes(cookie)).toEqual(['c=v', 'Path=/', 'Max-Age=1', 'HttpOnly', 'SameSite=Lax', 'Secure']);
  });

  it('writes Max-Age=0 and an empty value for a deletion', () => {
    expect(
      serializeCookie({ name: 'c', value: '', maxAgeSeconds: 0, env: env('development') }),
    ).toContain('c=; Path=/; Max-Age=0');
  });
});

describe('readCookie', () => {
  it('returns null when the request carries no Cookie header at all', () => {
    expect(readCookie(requestWith(null), 'devmentor_session')).toBeNull();
  });

  it('returns null for an empty Cookie header', () => {
    expect(readCookie(requestWith(''), 'devmentor_session')).toBeNull();
  });

  it('finds the named cookie among others, trimming the surrounding space', () => {
    const header = 'theme=dark; devmentor_oauth_state=state.token ; devmentor_session=s';

    expect(readCookie(requestWith(header), 'devmentor_oauth_state')).toBe('state.token');
    expect(readCookie(requestWith(header), 'devmentor_session')).toBe('s');
  });

  it('returns null for a name that is absent from a populated header', () => {
    expect(readCookie(requestWith('theme=dark'), 'devmentor_session')).toBeNull();
  });

  it('skips a bare attribute with no "=" rather than reading it as a name', () => {
    expect(readCookie(requestWith('HttpOnly; devmentor_session=s'), 'devmentor_session')).toBe('s');
    expect(readCookie(requestWith('devmentor_session'), 'devmentor_session')).toBeNull();
  });

  it('returns the value verbatim, without percent-decoding it', () => {
    // We never encode on write, so decoding could only corrupt a value — or throw
    // `URIError` on a hostile `%zz`, handing a 500 to anyone who can set a cookie.
    expect(readCookie(requestWith('c=%zz%20raw'), 'c')).toBe('%zz%20raw');
  });

  it('keeps an "=" inside the value, which base64 padding produces', () => {
    expect(readCookie(requestWith('c=YWJj=='), 'c')).toBe('YWJj==');
  });
});

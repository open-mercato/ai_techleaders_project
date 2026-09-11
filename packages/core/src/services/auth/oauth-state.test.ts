import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../config/env';
import type { CookieEnv } from '../../http/cookies';
import {
  clearOauthStateCookie,
  issueOauthStateCookie,
  readOauthStateCookie,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
} from './oauth-state';

const env = (NODE_ENV: AppEnv['NODE_ENV']): CookieEnv => ({ NODE_ENV });

function callback(cookieHeader?: string): Request {
  return new Request('http://devmentor.test/api/auth/github/callback?state=x', {
    headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
  });
}

describe('the OAuth state cookie', () => {
  it('is ten minutes long, matching the state token it carries', () => {
    expect(OAUTH_STATE_TTL_SECONDS).toBe(600);
  });

  it('binds a state token to this browser, httpOnly and SameSite=Lax', () => {
    const cookie = issueOauthStateCookie('state.token', env('development'));

    expect(cookie).toBe(
      `${OAUTH_STATE_COOKIE_NAME}=state.token; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`,
    );
  });

  it('is Secure in production and not before', () => {
    expect(issueOauthStateCookie('s', env('production'))).toContain('; Secure');
    expect(issueOauthStateCookie('s', env('development'))).not.toContain('Secure');
  });

  it('clears with an empty value and Max-Age=0, so a state is single-use', () => {
    expect(clearOauthStateCookie(env('development'))).toBe(
      `${OAUTH_STATE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    );
    expect(clearOauthStateCookie(env('production'))).toContain('; Secure');
  });

  it('reads the value back off a callback request', () => {
    expect(
      readOauthStateCookie(callback(`theme=dark; ${OAUTH_STATE_COOKIE_NAME}=state.token`)),
    ).toBe('state.token');
  });

  it('answers null when the browser sent no state cookie', () => {
    expect(readOauthStateCookie(callback())).toBeNull();
    expect(readOauthStateCookie(callback('devmentor_session=s'))).toBeNull();
  });

  it('round-trips what it issued', () => {
    const cookie = issueOauthStateCookie('round.trip.token', env('test'));
    const [pair] = cookie.split('; ');

    expect(readOauthStateCookie(callback(pair))).toBe('round.trip.token');
  });
});

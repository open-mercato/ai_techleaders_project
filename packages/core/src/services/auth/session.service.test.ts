import { SignJWT, type JWTPayload } from 'jose';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../config/env';
import type { Clock } from '../../time/clock';
import { ServiceUnavailableError } from '../../http/errors';
import { SESSION_COOKIE_NAME, SessionService } from './session.service';
import { TokenService } from './token.service';

const CURRENT_SECRET = 'current-secret-'.padEnd(48, 'c');
const PREVIOUS_SECRET = 'previous-secret-'.padEnd(48, 'p');
const FOREIGN_SECRET = 'foreign-secret-'.padEnd(48, 'f');

/** A fixed instant far from the wall clock, so "the clock is honoured" is observable. */
const T0 = new Date('2030-01-01T00:00:00.000Z');

/** The 24 h lifetime, restated here so the test fails if the constant moves silently. */
const DAY_SECONDS = 86_400;

/** A clock a test can wind forward without sleeping. */
function fakeClock(start: Date = T0): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

type TestEnv = Partial<Pick<AppEnv, 'SESSION_SECRET' | 'SESSION_SECRET_PREVIOUS' | 'NODE_ENV'>>;

function makeService(env: TestEnv = {}, clock: Clock = fakeClock()): SessionService {
  return new SessionService({
    env: { NODE_ENV: 'development', SESSION_SECRET: CURRENT_SECRET, ...env } as AppEnv,
    clock,
  });
}

/**
 * Parse a `Set-Cookie` value into its parts.
 *
 * Deliberately not a substring match: the attribute list is compared as a whole object,
 * so a misspelled flag, a missing one, an extra one, or `SameSite=Strict` all fail. The
 * `'; '` separator is part of what is being asserted — a serializer that forgot the
 * space would produce attribute names starting with `;`.
 */
function parseSetCookie(header: string): {
  name: string;
  value: string;
  attributes: Record<string, string | true>;
} {
  const [pair = '', ...rest] = header.split('; ');
  const separator = pair.indexOf('=');
  const attributes: Record<string, string | true> = {};

  for (const attribute of rest) {
    const at = attribute.indexOf('=');
    if (at === -1) {
      attributes[attribute] = true;
    } else {
      attributes[attribute.slice(0, at)] = attribute.slice(at + 1);
    }
  }

  return { name: pair.slice(0, separator), value: pair.slice(separator + 1), attributes };
}

/** Decode a compact JWT segment without verifying anything. */
function decodeSegment(token: string, index: number): JWTPayload {
  return JSON.parse(Buffer.from(token.split('.')[index] ?? '', 'base64url').toString('utf8'));
}

function decodePayload(token: string): JWTPayload {
  return decodeSegment(token, 1);
}

/** Recover the token from an issued `Set-Cookie` value. */
function tokenOf(cookie: string): string {
  return parseSetCookie(cookie).value;
}

/** Flip one character of the signature, leaving header and payload byte-identical. */
function tamperSignature(token: string): string {
  const [header, payload, signature = ''] = token.split('.');
  const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
  return `${header}.${payload}.${flipped}`;
}

/** Sign a token directly, bypassing the service, to build inputs it would never produce. */
async function signRaw(
  secret: string,
  // Not `JWTPayload`: several cases plant a `sub` or `sv` of the wrong *type*, which is
  // the branch under test, and `JWTPayload` types `sub` as a string.
  claims: Record<string, unknown> & { aud?: string; exp?: Date; iat?: Date } = {},
): Promise<string> {
  const { aud, exp, iat, ...rest } = claims;
  let jwt = new SignJWT(rest as JWTPayload).setProtectedHeader({ alg: 'HS256' });
  if (aud !== undefined) jwt = jwt.setAudience(aud);
  jwt = jwt.setIssuedAt(iat ?? T0);
  jwt = jwt.setExpirationTime(exp ?? new Date(T0.getTime() + DAY_SECONDS * 1000));
  return jwt.sign(new TextEncoder().encode(secret));
}

/** A `Request` carrying a raw `Cookie` header. */
function requestWithCookies(header?: string): Request {
  return new Request('https://devmentor.test/api/thing', {
    headers: header === undefined ? {} : { cookie: header },
  });
}

describe('issue', () => {
  it('signs identity and session version, and nothing else', async () => {
    const service = makeService();

    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 7 });
    const token = tokenOf(cookie);
    const header = decodeSegment(token, 0);
    const payload = decodePayload(token);

    expect(token.split('.')).toHaveLength(3);
    expect(header).toEqual({ alg: 'HS256' });
    expect(payload).toEqual({
      sub: 'user-1',
      sv: 7,
      aud: 'session',
      // Both derived from the injected clock (2030), never from `Date.now()`.
      iat: T0.getTime() / 1000,
      exp: T0.getTime() / 1000 + DAY_SECONDS,
    });
    // The assertion that matters most in this file: the exhaustive `toEqual` above means
    // a `roles` claim cannot be added without failing here. Roles are loaded live,
    // because `operator` authority is derived from `OPERATOR_EMAILS` on every request.
    expect(payload).not.toHaveProperty('roles');
  });

  it('reports the expiry it put in the token, 24 hours out', async () => {
    const service = makeService();

    const { cookie, expiresAt } = await service.issue({ id: 'user-1', sessionVersion: 0 });

    expect(expiresAt).toEqual(new Date(T0.getTime() + DAY_SECONDS * 1000));
    expect(decodePayload(tokenOf(cookie)).exp).toBe(expiresAt.getTime() / 1000);
  });

  it('builds the cookie with exactly the documented attributes outside production', async () => {
    const service = makeService({ NODE_ENV: 'development' });

    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 0 });
    const parsed = parseSetCookie(cookie);

    expect(parsed.name).toBe(SESSION_COOKIE_NAME);
    expect(parsed.name).toBe('devmentor_session');
    expect(parsed.attributes).toEqual({
      'Path': '/',
      // The browser drops its copy exactly when the signature stops verifying.
      'Max-Age': String(DAY_SECONDS),
      'HttpOnly': true,
      // `Lax`, never `Strict`: the post-OAuth landing is a cross-site top-level
      // navigation, and a `Strict` cookie is not sent on one.
      'SameSite': 'Lax',
    });
    // `npm run dev` serves plain HTTP, so a `Secure` cookie would never be stored.
    expect(parsed.attributes).not.toHaveProperty('Secure');
  });

  it('adds Secure in production and only in production', async () => {
    for (const nodeEnv of ['development', 'test'] as const) {
      const { cookie } = await makeService({ NODE_ENV: nodeEnv }).issue({
        id: 'user-1',
        sessionVersion: 0,
      });
      expect(parseSetCookie(cookie).attributes).not.toHaveProperty('Secure');
    }

    const { cookie } = await makeService({ NODE_ENV: 'production' }).issue({
      id: 'user-1',
      sessionVersion: 0,
    });

    expect(parseSetCookie(cookie).attributes).toEqual({
      'Path': '/',
      'Max-Age': String(DAY_SECONDS),
      'HttpOnly': true,
      'SameSite': 'Lax',
      'Secure': true,
    });
  });

  it('throws ServiceUnavailableError when SESSION_SECRET is missing', async () => {
    const service = makeService({ SESSION_SECRET: undefined });

    await expect(service.issue({ id: 'user-1', sessionVersion: 0 })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    await expect(service.issue({ id: 'user-1', sessionVersion: 0 })).rejects.toThrow(
      // The message must name the variable, say what is down, and never quote a value.
      /Sessions are unavailable because SESSION_SECRET is not configured/,
    );
  });

  it('never signs with SESSION_SECRET_PREVIOUS', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });

    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 3 });

    // The proof a rotation is one-directional: a verifier that only knows the previous
    // secret cannot read what we just issued.
    const previousOnly = makeService({ SESSION_SECRET: PREVIOUS_SECRET });
    expect(await previousOnly.verify(tokenOf(cookie))).toBeNull();
  });
});

describe('verify', () => {
  it('round-trips identity and session version', async () => {
    const service = makeService();

    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 7 });

    expect(await service.verify(tokenOf(cookie))).toEqual({
      userId: 'user-1',
      sessionVersion: 7,
    });
  });

  it('round-trips a zero session version rather than treating it as absent', async () => {
    // Every freshly created user starts at 0, so this is the common case, not an edge.
    const service = makeService();

    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 0 });

    expect(await service.verify(tokenOf(cookie))).toEqual({
      userId: 'user-1',
      sessionVersion: 0,
    });
  });

  it('rejects a cookie whose signature was tampered with', async () => {
    const service = makeService();
    const { cookie } = await service.issue({ id: 'mentee-1', sessionVersion: 1 });

    expect(await service.verify(tamperSignature(tokenOf(cookie)))).toBeNull();
  });

  it('rejects a cookie whose payload was swapped under a valid signature', async () => {
    // The privilege-escalation attempt this whole mechanism exists to defeat: keep the
    // signature, rewrite the subject.
    const service = makeService();
    const { cookie } = await service.issue({ id: 'mentee-1', sessionVersion: 1 });
    const [header, , signature] = tokenOf(cookie).split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'operator-1', sv: 1, aud: 'session' }),
      'utf8',
    ).toString('base64url');

    expect(await service.verify(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('rejects an unsigned `alg: none` token', async () => {
    // The algorithm allowlist in one assertion: the header does not get a vote.
    const service = makeService();
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const token = `${encode({ alg: 'none' })}.${encode({
      sub: 'operator-1',
      sv: 0,
      aud: 'session',
      exp: T0.getTime() / 1000 + DAY_SECONDS,
    })}.`;

    expect(await service.verify(token)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not a JWT', 'not-a-token'],
    ['two segments', 'aaa.bbb'],
    ['four segments', 'aaa.bbb.ccc.ddd'],
    ['non-base64 segments', '!!!.???.***'],
    ['a percent-escape a decoder would choke on', '%zz'],
  ])('rejects a malformed cookie value (%s)', async (_label, value) => {
    const service = makeService();

    expect(await service.verify(value)).toBeNull();
  });

  it('rejects a token signed with an unrelated secret', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });
    const token = await signRaw(FOREIGN_SECRET, { sub: 'user-1', sv: 0, aud: 'session' });

    // Both known keys are tried and both fail; the loop must not fall through to a
    // "well, it parsed" acceptance.
    expect(await service.verify(token)).toBeNull();
  });

  it('rejects a previous-secret token when no previous secret is configured', async () => {
    const service = makeService();
    const token = await signRaw(PREVIOUS_SECRET, { sub: 'user-1', sv: 0, aud: 'session' });

    expect(await service.verify(token)).toBeNull();
  });

  it.each([
    ['no subject', { sv: 0 }],
    ['an empty subject', { sub: '', sv: 0 }],
    ['a non-string subject', { sub: 42, sv: 0 }],
    ['no session version', { sub: 'user-1' }],
    ['a non-numeric session version', { sub: 'user-1', sv: '3' }],
    ['a fractional session version', { sub: 'user-1', sv: 1.5 }],
  ])('rejects a token that verifies but carries %s', async (_label, claims) => {
    // Signed with our own key, so the signature check passes and only the claim shape
    // can reject it. `sub`/`sv` are optional in the JWT spec, so this is reachable.
    const service = makeService();
    const token = await signRaw(CURRENT_SECRET, { ...claims, aud: 'session' });

    expect(await service.verify(token)).toBeNull();
  });

  it('throws ServiceUnavailableError when SESSION_SECRET is missing', async () => {
    // Even with a usable previous secret: verifying against a rotation's tail alone
    // would mean serving traffic we could not issue sessions for.
    const service = makeService({
      SESSION_SECRET: undefined,
      SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET,
    });
    const token = await signRaw(PREVIOUS_SECRET, { sub: 'user-1', sv: 0, aud: 'session' });

    await expect(service.verify(token)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe('audience separation', () => {
  it('rejects a purpose token presented as a session cookie', async () => {
    // Same secret, same algorithm, same issuer — only `aud` differs, and that is the
    // whole point: a verification link mailed to an inbox must not be a session.
    const tokens = new TokenService({
      env: { SESSION_SECRET: CURRENT_SECRET } as AppEnv,
      clock: fakeClock(),
    });
    const service = makeService();

    for (const purpose of ['oauth-state', 'email-verify'] as const) {
      const token = await tokens.signPurposeToken({
        purpose,
        subject: 'user-1',
        ttlSeconds: 600,
      });
      expect(await service.verify(token)).toBeNull();
    }
  });

  it('is rejected in the other direction too: a session is not a purpose token', async () => {
    const tokens = new TokenService({
      env: { SESSION_SECRET: CURRENT_SECRET } as AppEnv,
      clock: fakeClock(),
    });
    const { cookie } = await makeService().issue({ id: 'user-1', sessionVersion: 0 });
    const token = tokenOf(cookie);

    expect(await tokens.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
    expect(await tokens.verifyPurposeToken({ token, purpose: 'email-verify' })).toBeNull();
  });

  it('rejects a token carrying no audience at all', async () => {
    const service = makeService();
    const token = await signRaw(CURRENT_SECRET, { sub: 'user-1', sv: 0 });

    expect(await service.verify(token)).toBeNull();
  });
});

describe('the injected clock', () => {
  it('rejects a session once the injected clock passes exp', async () => {
    const clock = fakeClock();
    const service = makeService({}, clock);
    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 2 });
    const token = tokenOf(cookie);

    // A second inside the 24 h window: still good. No sleeping anywhere in this file.
    clock.advance((DAY_SECONDS - 1) * 1000);
    expect(await service.verify(token)).toEqual({ userId: 'user-1', sessionVersion: 2 });

    // Past `exp`: `jose` compares against `currentDate`, which is this clock.
    clock.advance(2_000);
    expect(await service.verify(token)).toBeNull();
  });

  it('honours the injected clock over the host wall clock', async () => {
    // Issued in 2020 with a 24 h life — long dead by the wall clock — but the verifier's
    // clock sits inside that window, so it verifies. The host's time is never consulted.
    const past = new Date('2020-01-01T00:00:00.000Z');
    const { cookie } = await makeService({}, fakeClock(past)).issue({
      id: 'user-1',
      sessionVersion: 0,
    });

    expect(
      await makeService({}, fakeClock(new Date(past.getTime() + 60_000))).verify(tokenOf(cookie)),
    ).toEqual({ userId: 'user-1', sessionVersion: 0 });

    // The mirror image: a cookie the wall clock would call live is expired according to
    // a clock wound past it.
    expect(await makeService({}, fakeClock(T0)).verify(tokenOf(cookie))).toBeNull();
  });
});

describe('secret rotation', () => {
  it('accepts a session signed with SESSION_SECRET_PREVIOUS', async () => {
    // The half-deployed rotation: signed in yesterday, still browsing today.
    const beforeRotation = makeService({ SESSION_SECRET: PREVIOUS_SECRET });
    const { cookie } = await beforeRotation.issue({ id: 'user-1', sessionVersion: 4 });

    const afterRotation = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });

    expect(await afterRotation.verify(tokenOf(cookie))).toEqual({
      userId: 'user-1',
      sessionVersion: 4,
    });
  });

  it('still enforces the audience on a previous-secret token', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });
    const token = await signRaw(PREVIOUS_SECRET, { sub: 'user-1', sv: 0, aud: 'email-verify' });

    expect(await service.verify(token)).toBeNull();
  });

  it('verifies a current-secret session without consulting the previous secret', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });
    const { cookie } = await service.issue({ id: 'user-1', sessionVersion: 0 });

    expect(await service.verify(tokenOf(cookie))).toEqual({
      userId: 'user-1',
      sessionVersion: 0,
    });
  });
});

describe('clear', () => {
  it('expires the cookie with the same attributes it was set with', async () => {
    const parsed = parseSetCookie(makeService().clear());

    expect(parsed.name).toBe(SESSION_COOKIE_NAME);
    expect(parsed.value).toBe('');
    expect(parsed.attributes).toEqual({
      // Name and Path must match the issued cookie or the browser keeps the original.
      'Path': '/',
      'Max-Age': '0',
      'HttpOnly': true,
      'SameSite': 'Lax',
    });
  });

  it('carries Secure in production, like the cookie it replaces', async () => {
    expect(parseSetCookie(makeService({ NODE_ENV: 'production' }).clear()).attributes).toEqual({
      'Path': '/',
      'Max-Age': '0',
      'HttpOnly': true,
      'SameSite': 'Lax',
      'Secure': true,
    });
  });

  it('needs no session, and no SESSION_SECRET either', () => {
    // Sign-out must never fail (edge case 27). Signing out with an expired or tampered
    // cookie clears it and succeeds; so does signing out of a deployment whose secret
    // has gone missing, which is exactly when a user most wants the cookie gone.
    const service = makeService({ SESSION_SECRET: undefined, SESSION_SECRET_PREVIOUS: undefined });

    expect(() => service.clear()).not.toThrow();
    expect(parseSetCookie(service.clear()).attributes['Max-Age']).toBe('0');
  });
});

describe('readCookie', () => {
  it('returns null when the request carries no Cookie header', () => {
    expect(makeService().readCookie(requestWithCookies())).toBeNull();
  });

  it('returns null when the header carries other cookies but not ours', () => {
    expect(
      makeService().readCookie(requestWithCookies('devmentor_oauth_state=abc; theme=dark')),
    ).toBeNull();
  });

  it('finds the session cookie among others, whatever its position', () => {
    const service = makeService();

    expect(service.readCookie(requestWithCookies(`${SESSION_COOKIE_NAME}=first; theme=dark`))).toBe(
      'first',
    );
    expect(service.readCookie(requestWithCookies(`theme=dark; ${SESSION_COOKIE_NAME}=last`))).toBe(
      'last',
    );
  });

  it('skips a segment with no value separator instead of misreading it', () => {
    // A malformed header should not make the parser treat `nonsense` as a cookie name
    // and fall over, nor mask the real cookie behind it.
    expect(
      makeService().readCookie(requestWithCookies(`nonsense; ${SESSION_COOKIE_NAME}=tok`)),
    ).toBe('tok');
    expect(makeService().readCookie(requestWithCookies('nonsense'))).toBeNull();
  });

  it('does not match a cookie whose name merely ends with ours', () => {
    expect(
      makeService().readCookie(requestWithCookies(`not_${SESSION_COOKIE_NAME}=tok`)),
    ).toBeNull();
  });

  it('returns the value verbatim, without percent-decoding', () => {
    // Decoding would buy nothing (we never encode on write) and would throw `URIError`
    // on `%zz` — a 500 handed to anyone who can set a cookie. The value comes back as
    // sent, and `verify` is what rejects it.
    const service = makeService();

    expect(service.readCookie(requestWithCookies(`${SESSION_COOKIE_NAME}=%zz`))).toBe('%zz');
    expect(service.readCookie(requestWithCookies(`${SESSION_COOKIE_NAME}=a%20b`))).toBe('a%20b');
  });

  it('returns an empty value rather than null when the cookie was cleared', () => {
    // A browser that has just been sent `clear()` may still round-trip an empty value.
    // "Present but empty" must not be reported as "absent"; `verify('')` rejects it.
    expect(makeService().readCookie(requestWithCookies(`${SESSION_COOKIE_NAME}=`))).toBe('');
  });

  it('completes the round trip: issue → Cookie header → readCookie → verify', async () => {
    // The serializer and the parser are inverses; this is the only test that proves it
    // end to end, the way a browser exercises them.
    const service = makeService();
    const { cookie } = await service.issue({ id: 'user-9', sessionVersion: 2 });
    const [pair] = cookie.split('; ');

    const value = service.readCookie(requestWithCookies(`theme=dark; ${pair}`));

    expect(value).not.toBeNull();
    expect(await service.verify(value as string)).toEqual({
      userId: 'user-9',
      sessionVersion: 2,
    });
  });
});

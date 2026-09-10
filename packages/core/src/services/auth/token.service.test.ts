import { SignJWT, type JWTPayload } from 'jose';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../config/env';
import type { Clock } from '../../time/clock';
import { ServiceUnavailableError } from '../../http/errors';
import { TokenService, type TokenPurpose } from './token.service';

const CURRENT_SECRET = 'current-secret-'.padEnd(48, 'c');
const PREVIOUS_SECRET = 'previous-secret-'.padEnd(48, 'p');
const FOREIGN_SECRET = 'foreign-secret-'.padEnd(48, 'f');

/** A fixed instant far from the wall clock, so "the clock is honoured" is observable. */
const T0 = new Date('2030-01-01T00:00:00.000Z');

/** A clock a test can wind forward without sleeping. */
function fakeClock(start: Date = T0): Clock & { set(at: Date): void; advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    set: (at: Date) => {
      current = at;
    },
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

function makeService(
  env: Partial<Pick<AppEnv, 'SESSION_SECRET' | 'SESSION_SECRET_PREVIOUS'>> = {},
  clock: Clock = fakeClock(),
): TokenService {
  return new TokenService({
    env: { SESSION_SECRET: CURRENT_SECRET, ...env } as AppEnv,
    clock,
  });
}

/** Flip one character of the signature, leaving header and payload byte-identical. */
function tamperSignature(token: string): string {
  const [header, payload, signature = ''] = token.split('.');
  const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
  return `${header}.${payload}.${flipped}`;
}

describe('stored opaque tokens', () => {
  it('mints a 32-byte URL-safe token together with its storage hash', () => {
    const service = makeService();

    const pair = service.mintOpaqueToken();

    expect(pair.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(pair.token, 'base64url')).toHaveLength(32);
    expect(pair.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pair.tokenHash).toBe(service.hashToken(pair.token));
  });

  it('mints distinct bearer secrets and hashes', () => {
    const service = makeService();

    const first = service.mintOpaqueToken();
    const second = service.mintOpaqueToken();

    expect(second.token).not.toBe(first.token);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it('hashes the same token deterministically with SHA-256', () => {
    const service = makeService();
    const token = 'opaque-token_example';

    expect(service.hashToken(token)).toBe(
      'c1f61fe38117bd3cb8b670233939ad139ea1a2b373302cdb1cef47d80f427e74',
    );
    expect(service.hashToken(token)).toBe(service.hashToken(token));
  });

  it('hashes the exact UTF-8 token without trimming or case folding', () => {
    const service = makeService();

    expect(service.hashToken('Token')).not.toBe(service.hashToken('token'));
    expect(service.hashToken('token ')).not.toBe(service.hashToken('token'));
    expect(service.hashToken('żółć')).toHaveLength(64);
  });
});

/** Sign a token directly, bypassing the service, to build inputs it would never produce. */
async function signRaw(
  secret: string,
  claims: { sub?: string; aud?: string; exp?: Date; iat?: Date } = {},
): Promise<string> {
  let jwt = new SignJWT({}).setProtectedHeader({ alg: 'HS256' });
  if (claims.sub !== undefined) jwt = jwt.setSubject(claims.sub);
  if (claims.aud !== undefined) jwt = jwt.setAudience(claims.aud);
  jwt = jwt.setIssuedAt(claims.iat ?? T0);
  jwt = jwt.setExpirationTime(claims.exp ?? new Date(T0.getTime() + 600_000));
  return jwt.sign(new TextEncoder().encode(secret));
}

describe('signPurposeToken', () => {
  it('produces a compact HS256 JWT carrying the purpose, subject and clock-derived times', async () => {
    const service = makeService();

    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: '/mentors/ada',
      ttlSeconds: 600,
    });

    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));

    expect(token.split('.')).toHaveLength(3);
    expect(header).toEqual({ alg: 'HS256' });
    expect(payload).toMatchObject({
      sub: '/mentors/ada',
      aud: 'oauth-state',
      // Both derived from the injected clock (2030), never from `Date.now()`.
      iat: T0.getTime() / 1000,
      exp: T0.getTime() / 1000 + 600,
    });
  });

  it('never signs with SESSION_SECRET_PREVIOUS', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });

    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: 'x',
      ttlSeconds: 600,
    });

    // The proof a rotation is one-directional: a verifier that only knows the previous
    // secret cannot read what we just issued.
    const previousOnly = new TokenService({
      env: { SESSION_SECRET: PREVIOUS_SECRET } as AppEnv,
      clock: fakeClock(),
    });
    expect(await previousOnly.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('throws ServiceUnavailableError when SESSION_SECRET is missing', async () => {
    const service = makeService({ SESSION_SECRET: undefined });

    await expect(
      service.signPurposeToken({ purpose: 'oauth-state', subject: 'x', ttlSeconds: 600 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(
      service.signPurposeToken({ purpose: 'oauth-state', subject: 'x', ttlSeconds: 600 }),
      // The message must name the variable and never quote a value.
    ).rejects.toThrow(/SESSION_SECRET is not configured/);
  });
});

describe('verifyPurposeToken', () => {
  it('round-trips the subject', async () => {
    const service = makeService();

    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: '/mentors/ada?slot=1',
      ttlSeconds: 600,
    });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toEqual({
      subject: '/mentors/ada?slot=1',
    });
  });

  it('round-trips the empty subject rather than treating it as absent', async () => {
    // `safeReturnTo(?returnTo, '')` is exactly what the OAuth start route signs, so
    // "no particular destination" has to survive as a subject.
    const service = makeService();

    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: '',
      ttlSeconds: 600,
    });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toEqual({
      subject: '',
    });
  });

  it('rejects a token issued for a different purpose', async () => {
    const service = makeService();

    const token = await service.signPurposeToken({
      purpose: 'email-verify',
      subject: 'user-1',
      ttlSeconds: 600,
    });

    // The audience separation B2/B5 promise: a verification link presented where an
    // OAuth state is expected is not merely wrong, it is unreadable.
    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
    expect(await service.verifyPurposeToken({ token, purpose: 'email-verify' })).toEqual({
      subject: 'user-1',
    });
  });

  it('rejects a token carrying no audience at all', async () => {
    const service = makeService();
    const token = await signRaw(CURRENT_SECRET, { sub: 'user-1' });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('rejects a token whose signature was tampered with', async () => {
    const service = makeService();
    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: '/admin',
      ttlSeconds: 600,
    });

    expect(
      await service.verifyPurposeToken({ token: tamperSignature(token), purpose: 'oauth-state' }),
    ).toBeNull();
  });

  it('rejects a token whose payload was swapped under a valid signature', async () => {
    const service = makeService();
    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: 'mentee-1',
      ttlSeconds: 600,
    });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'operator-1', aud: 'oauth-state' }),
      'utf8',
    ).toString('base64url');

    expect(
      await service.verifyPurposeToken({
        token: `${header}.${forgedPayload}.${signature}`,
        purpose: 'oauth-state',
      }),
    ).toBeNull();
  });

  it('rejects an unsigned `alg: none` token', async () => {
    // The algorithm allowlist in one assertion: the header does not get a vote.
    const service = makeService();
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const token = `${encode({ alg: 'none' })}.${encode({
      sub: 'operator-1',
      aud: 'oauth-state',
      exp: T0.getTime() / 1000 + 600,
    })}.`;

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not a JWT', 'not-a-token'],
    ['two segments', 'aaa.bbb'],
    ['four segments', 'aaa.bbb.ccc.ddd'],
    ['non-base64 segments', '!!!.???.***'],
  ])('rejects a malformed token (%s)', async (_label, token) => {
    const service = makeService();

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('rejects a token that verifies but carries no subject', async () => {
    const service = makeService();
    const token = await signRaw(CURRENT_SECRET, { aud: 'oauth-state' });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('rejects a token whose subject is not a string', async () => {
    const service = makeService();
    // `setSubject` is typed `string`, so a non-string `sub` has to be planted directly.
    const token = await new SignJWT({ sub: 42 } as unknown as JWTPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('oauth-state')
      .setIssuedAt(T0)
      .setExpirationTime(new Date(T0.getTime() + 600_000))
      .sign(new TextEncoder().encode(CURRENT_SECRET));

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('rejects a token signed with an unrelated secret', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });
    const token = await signRaw(FOREIGN_SECRET, { sub: 'user-1', aud: 'oauth-state' });

    // Both known keys are tried and both fail; the loop must not fall through to a
    // "well, it parsed" acceptance.
    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('rejects a token signed with the previous secret when no previous secret is configured', async () => {
    const service = makeService();
    const token = await signRaw(PREVIOUS_SECRET, { sub: 'user-1', aud: 'oauth-state' });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('throws ServiceUnavailableError when SESSION_SECRET is missing', async () => {
    // Even with a usable previous secret: verifying against a rotation's tail alone
    // would mean serving traffic we could not issue tokens for.
    const service = makeService({
      SESSION_SECRET: undefined,
      SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET,
    });
    const token = await signRaw(PREVIOUS_SECRET, { sub: 'user-1', aud: 'oauth-state' });

    await expect(service.verifyPurposeToken({ token, purpose: 'oauth-state' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });
});

describe('secret rotation', () => {
  it('accepts a token signed with SESSION_SECRET_PREVIOUS', async () => {
    // The in-flight verification email: signed before the rotation, opened after it.
    const beforeRotation = new TokenService({
      env: { SESSION_SECRET: PREVIOUS_SECRET } as AppEnv,
      clock: fakeClock(),
    });
    const token = await beforeRotation.signPurposeToken({
      purpose: 'email-verify',
      subject: 'user-1',
      ttlSeconds: 86_400,
    });

    const afterRotation = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });

    expect(await afterRotation.verifyPurposeToken({ token, purpose: 'email-verify' })).toEqual({
      subject: 'user-1',
    });
  });

  it('still enforces the audience on a previous-secret token', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });
    const token = await signRaw(PREVIOUS_SECRET, { sub: 'user-1', aud: 'email-verify' });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('verifies a current-secret token without consulting the previous secret', async () => {
    const service = makeService({ SESSION_SECRET_PREVIOUS: PREVIOUS_SECRET });
    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: 'x',
      ttlSeconds: 600,
    });

    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toEqual({
      subject: 'x',
    });
  });
});

describe('the injected clock', () => {
  it('rejects a token once the injected clock passes exp', async () => {
    const clock = fakeClock();
    const service = makeService({}, clock);
    const token = await service.signPurposeToken({
      purpose: 'oauth-state',
      subject: 'x',
      ttlSeconds: 600,
    });

    // One second inside the window: still good. No sleeping anywhere in this file.
    clock.advance(599_000);
    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toEqual({
      subject: 'x',
    });

    // Past `exp`: `jose` compares against `currentDate`, which is this clock.
    clock.advance(2_000);
    expect(await service.verifyPurposeToken({ token, purpose: 'oauth-state' })).toBeNull();
  });

  it('honours the injected clock over the host wall clock in both directions', async () => {
    // Long expired by the wall clock — signed in 2020 with a ten-minute life — but the
    // verifier's clock is inside that window, so it verifies. The host's time is never
    // consulted.
    const past = new Date('2020-01-01T00:00:00.000Z');
    const stale = await makeService({}, fakeClock(past)).signPurposeToken({
      purpose: 'oauth-state',
      subject: 'x',
      ttlSeconds: 600,
    });
    expect(
      await makeService({}, fakeClock(new Date(past.getTime() + 60_000))).verifyPurposeToken({
        token: stale,
        purpose: 'oauth-state',
      }),
    ).toEqual({ subject: 'x' });

    // The mirror image: a token the wall clock would call live is expired according to
    // a clock wound past it.
    const wallClockLive = await makeService({}, fakeClock(new Date())).signPurposeToken({
      purpose: 'oauth-state',
      subject: 'x',
      ttlSeconds: 600,
    });
    expect(
      await makeService({}, fakeClock(T0)).verifyPurposeToken({
        token: wallClockLive,
        purpose: 'oauth-state',
      }),
    ).toBeNull();
  });

  it('does not reject a token whose iat is ahead of the verifying clock', async () => {
    // Documenting a deliberate omission rather than a gap. We set no `nbf`, and `iat`
    // is a statement of origin, not a validity floor — `jose` only inspects it under
    // `maxTokenAge`. A "not yet valid" rule would buy nothing (we sign these ourselves)
    // and would make a few seconds of clock skew between two app instances break
    // sign-in during a rolling deploy.
    const token = await makeService({}, fakeClock(T0)).signPurposeToken({
      purpose: 'oauth-state',
      subject: 'x',
      ttlSeconds: 600,
    });

    expect(
      await makeService({}, fakeClock(new Date('2020-01-01T00:00:00.000Z'))).verifyPurposeToken({
        token,
        purpose: 'oauth-state',
      }),
    ).toEqual({ subject: 'x' });
  });
});

describe('the purpose vocabulary', () => {
  it('round-trips every declared purpose against itself and rejects every other one', async () => {
    const purposes: TokenPurpose[] = ['oauth-state', 'email-verify'];
    const service = makeService();

    for (const signed of purposes) {
      const token = await service.signPurposeToken({
        purpose: signed,
        subject: 'user-1',
        ttlSeconds: 600,
      });
      for (const accepted of purposes) {
        const claims = await service.verifyPurposeToken({ token, purpose: accepted });
        expect(claims).toEqual(signed === accepted ? { subject: 'user-1' } : null);
      }
    }
  });
});

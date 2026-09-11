import { scryptSync, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED_PASSWORD, SEED_PASSWORD_HASH } from './seed-password';

/**
 * The `db`-side half of the seeded-credential guard: this file proves the constant is
 * genuinely a `scrypt` hash of `SEED_PASSWORD` rather than a plausible-looking string, using
 * only `node:crypto` and the parameters carried **inside the value**.
 *
 * Reading `ln`, `r` and `p` out of the encoded hash rather than restating them is the point.
 * A copy of the hashing service's parameters here would be the drift this design exists to
 * avoid; decoding them cannot drift, because a `verify` that ignored the stored parameters
 * would already be broken for every real user who registered before they were tuned.
 *
 * This is not the guard that matters most. It cannot see the real `PasswordService`, so it
 * cannot notice a change of *encoding* — that is
 * `packages/core/src/services/auth/seed-password.guard.test.ts`, which verifies this exact
 * string with the real hasher. The two together cover both failure modes: a garbage constant
 * and an unacceptable one.
 */

/** 128 * N * r is 128 MiB at these parameters; Node's 32 MiB default would throw. */
const MAXMEM = 256 * 1024 * 1024;

function decode(hash: string): {
  ln: number;
  r: number;
  p: number;
  dk: number;
  salt: Buffer;
  digest: Buffer;
} {
  const [empty, algorithm, parameters, salt, digest] = hash.split('$');
  expect(empty).toBe('');
  expect(algorithm).toBe('scrypt');

  const values = Object.fromEntries(
    (parameters as string).split(',').map((pair) => {
      const [key, value] = pair.split('=');
      return [key, Number(value)];
    }),
  );

  return {
    ln: values.ln as number,
    r: values.r as number,
    p: values.p as number,
    dk: values.dk as number,
    salt: Buffer.from(salt as string, 'base64'),
    digest: Buffer.from(digest as string, 'base64'),
  };
}

function derive(password: string, hash: string): Buffer {
  const { ln, r, p, dk, salt } = decode(hash);
  return scryptSync(password, salt, dk, { N: 2 ** ln, r, p, maxmem: MAXMEM });
}

describe('the seeded password', () => {
  it('is obviously not a production secret and fits the register schema bounds', () => {
    // The personas are `mock-*@devmentor.test` on a throwaway database. A seeded password
    // that reads like a real one invites someone to reuse it somewhere it matters.
    expect(SEED_PASSWORD).toBe('mock-password-not-a-secret');
    // `registerSchema` is `min(12).max(72)`, so the same value can be registered as well as
    // verified — a fixture that could not pass validation would be a trap for the harness.
    expect(SEED_PASSWORD.length).toBeGreaterThanOrEqual(12);
    expect(Buffer.byteLength(SEED_PASSWORD, 'utf8')).toBeLessThanOrEqual(72);
  });

  it('carries its own scrypt parameters, so tuning them cannot invalidate the hash', () => {
    const { ln, r, p, dk, salt, digest } = decode(SEED_PASSWORD_HASH);

    // OWASP's N=2^17, r=8, p=1 — the parameters the spec fixes for `PasswordService`. They
    // are asserted here as a description of the stored value, not as a rule the service must
    // keep: the encoding is self-describing precisely so the service may change them.
    expect({ ln, r, p, dk }).toEqual({ ln: 17, r: 8, p: 1, dk: 32 });
    expect(salt).toHaveLength(16);
    // `dk` is carried rather than inferred from the digest, so a truncated digest is a
    // mismatch instead of a quietly different scrypt computation. Both must agree here.
    expect(digest).toHaveLength(dk);
  });

  it('re-derives from SEED_PASSWORD with the parameters it encodes', () => {
    const derived = derive(SEED_PASSWORD, SEED_PASSWORD_HASH);

    expect(timingSafeEqual(derived, decode(SEED_PASSWORD_HASH).digest)).toBe(true);
  });

  it('does not re-derive from a different password', () => {
    // Without this the assertion above would still pass against a hash of anything at all,
    // and the documented plaintext could quietly stop being the one that works.
    const derived = derive(`${SEED_PASSWORD}!`, SEED_PASSWORD_HASH);

    expect(timingSafeEqual(derived, decode(SEED_PASSWORD_HASH).digest)).toBe(false);
  });
});

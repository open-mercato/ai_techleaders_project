import { SEED_PASSWORD, SEED_PASSWORD_HASH } from '@devmentor/db';
import { describe, expect, it } from 'vitest';
import { getEnv } from '../../config/env';
import type { Logger } from '../../logger';
import { PasswordService } from './password.service';

/**
 * The guard that keeps the seeded credential a credential.
 *
 * `packages/db` may not import `@devmentor/core`, so the seeder cannot call
 * `PasswordService` and stores a frozen hash instead (see
 * `packages/db/src/seeders/seed-password.ts` for why that beats a second copy of the KDF).
 * The cost of freezing a value is that nothing else compares it with the code that has to
 * accept it. This file is that comparison, and it runs in `core` because `core` may import
 * `db` while the reverse is forbidden.
 *
 * Encoded parameters are why a *parameter* change cannot break the seeded hash: `verify`
 * reads `ln`, `r`, `p` and `dk` out of the string it is given. What can break it is a change
 * of encoding or algorithm — and then every seeded persona stops being able to sign in, the
 * integration suite fails somewhere far away with "invalid credentials", and no test says
 * why. It fails here instead, naming the constant to regenerate.
 */

/** The service logs only the concurrency gate; nothing here should reach a logger at all. */
const silentLogger = {
  warn: () => undefined,
  info: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

describe('the seeded password hash', () => {
  const service = new PasswordService({ env: getEnv(), logger: silentLogger });

  it('verifies against the real PasswordService', async () => {
    // If this fails, `PasswordService`'s stored form changed. Regenerate
    // `SEED_PASSWORD_HASH` with `passwordService.hash(SEED_PASSWORD)` and paste the result
    // into `packages/db/src/seeders/seed-password.ts` — do not weaken this assertion.
    expect(await service.verify(SEED_PASSWORD, SEED_PASSWORD_HASH)).toBe(true);
  });

  it('rejects anything other than the documented plaintext', async () => {
    // Without this, a `verify` that returned `true` unconditionally would satisfy the
    // assertion above, and so would a hash of some other password.
    expect(await service.verify(`${SEED_PASSWORD}!`, SEED_PASSWORD_HASH)).toBe(false);
    expect(await service.verify('', SEED_PASSWORD_HASH)).toBe(false);
  });

  it('is the same shape the service produces today', async () => {
    // A freshly hashed value and the frozen one must be interchangeable: same algorithm,
    // same parameters, differing only in salt and digest. Comparing the parameter section
    // catches a silent parameter downgrade, which `verify` alone would happily accept.
    const fresh = await service.hash(SEED_PASSWORD);

    expect(fresh.split('$').slice(0, 3)).toEqual(SEED_PASSWORD_HASH.split('$').slice(0, 3));
    expect(fresh).not.toBe(SEED_PASSWORD_HASH);
    expect(await service.verify(SEED_PASSWORD, fresh)).toBe(true);
  });
});

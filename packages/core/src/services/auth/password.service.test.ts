import { scryptSync } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import { PasswordService, type PasswordWork } from './password.service';

/**
 * **How this suite stays fast.** A hash at the shipped parameters costs ~600 ms and
 * 128 MiB, so the suite pays that price exactly three times, all inside one `describe`:
 * two hashes of the same password issued *concurrently* (one wall-clock scrypt for
 * both, which is also what proves the salt is random), and one `verify` of the result.
 * Everything else is tested without production cost:
 *
 * - **Verification** runs against hashes encoded at `ln=1`, written here with
 *   `scryptSync`. That is not a shortcut around the production path — it *is* the
 *   "yesterday's parameters must still verify" case, and it only works because `verify`
 *   reads `ln`, `r`, `p` and `dk` back out of the string it was handed.
 * - **The `maxmem` regression** needs no hashing at all: the un-raised call is refused
 *   by OpenSSL's parameter check before any work starts.
 * - **The gate** is exercised through `withSlot` with callbacks that do no hashing, so
 *   the queueing, the bounded wait and the release-on-failure are all pure control flow.
 */

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const warn = logger.warn as unknown as ReturnType<typeof vi.fn>;

function makeService(overrides: Partial<AppEnv> = {}): PasswordService {
  return new PasswordService({
    env: {
      PASSWORD_HASH_CONCURRENCY: 2,
      PASSWORD_HASH_WAIT_MS: 1000,
      ...overrides,
    } as unknown as AppEnv,
    logger,
  });
}

/** A promise plus the handles to settle it from outside, for parking a gate slot. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

function base64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '');
}

/**
 * Encode a hash exactly the way `PasswordService` documents its stored form, at whatever
 * parameters the case needs. Duplicating the format here is deliberate: it pins the
 * encoding as a contract rather than letting a test agree with whatever the
 * implementation currently emits.
 */
function encodeAt(
  plaintext: string,
  options: { ln?: number; r?: number; p?: number; dk?: number; salt?: Buffer } = {},
): string {
  const { ln = 1, r = 8, p = 1, dk = 32, salt = Buffer.from('sixteen-byte-sal') } = options;
  const digest = scryptSync(plaintext, salt, dk, {
    N: 2 ** ln,
    r,
    p,
    maxmem: MAX_MEMORY_BYTES,
  });
  return `$scrypt$ln=${ln},r=${r},p=${p},dk=${dk}$${base64(salt)}$${base64(digest)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PasswordService at the shipped parameters', () => {
  const PASSWORD = 'correct horse battery staple';
  let first: string;
  let second: string;

  beforeAll(async () => {
    // Concurrently, so the suite pays one scrypt's wall time for two hashes. The service
    // admits both because the gate's default limit here is 2.
    [first, second] = await Promise.all([
      makeService().hash(PASSWORD),
      makeService().hash(PASSWORD),
    ]);
  }, 60_000);

  it('stores a self-describing digest and never the plaintext', () => {
    expect(first).not.toContain(PASSWORD);
    // The parameters travel with the digest. Asserting the literal block is the point:
    // the day these constants move, this test is the reminder that old hashes must keep
    // verifying, not a line to update.
    expect(first).toMatch(
      /^\$scrypt\$ln=17,r=8,p=1,dk=32\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    );
  });

  it('salts every hash, so the same password never encodes twice the same way', () => {
    expect(first).not.toBe(second);
    expect(first.split('$')[3]).not.toBe(second.split('$')[3]);
  });

  it('verifies the password it hashed', async () => {
    await expect(makeService().verify(PASSWORD, first)).resolves.toBe(true);
  }, 60_000);

  it('needs maxmem raised explicitly — the shipped parameters exceed the 32 MiB default', async () => {
    // Read N and r back out of a hash this module actually produced, so lowering the
    // constants and dropping the raise cannot make this test pass by accident.
    const params = Object.fromEntries(
      (first.split('$')[2] ?? '').split(',').map((entry) => entry.split('=')),
    ) as Record<string, string>;
    const N = 2 ** Number(params.ln);
    const r = Number(params.r);

    const NODE_DEFAULT_MAXMEM = 32 * 1024 * 1024;
    expect(128 * N * r).toBeGreaterThan(NODE_DEFAULT_MAXMEM);

    // Without the raise OpenSSL refuses the parameters outright — synchronously, before
    // any work is done, which is why this costs nothing to assert.
    expect(() => scryptSync('pw', 'salt', 32, { N, r, p: 1 })).toThrow(
      /memory limit exceeded/,
    );

    // And the raise is what makes it work: `beforeAll` above already hashed at these
    // parameters, so there is nothing further to run here.
    expect(first).toContain(`ln=${params.ln},r=${params.r}`);
  });
});

describe('verify', () => {
  const PASSWORD = 'a password from an older release';

  it('verifies a hash written at parameters the current constants no longer use', async () => {
    // The OWASP-bump case: `ln=1` is nothing like the shipped `ln=17`, and it still
    // verifies, because the parameters come from the stored string.
    await expect(makeService().verify(PASSWORD, encodeAt(PASSWORD))).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    await expect(makeService().verify('not it', encodeAt(PASSWORD))).resolves.toBe(false);
  });

  it('rejects a digest that differs in a single byte', async () => {
    // The equal-length, nearly-right case is the one `timingSafeEqual` exists for.
    const encoded = encodeAt(PASSWORD);
    const digest = Buffer.from(encoded.split('$')[4] ?? '', 'base64');
    const lastIndex = digest.length - 1;
    digest.writeUInt8(digest.readUInt8(lastIndex) ^ 0x01, lastIndex);
    const forged = `${encoded.split('$').slice(0, 4).join('$')}$${base64(digest)}`;

    await expect(makeService().verify(PASSWORD, forged)).resolves.toBe(false);
  });

  it('never verifies against an absent hash, and does not burn a hash doing it', async () => {
    // A GitHub-only account carries `password_hash` null. It must not be signed in by an
    // empty password, by the right password of some other account, or by anything else.
    const service = makeService();

    await expect(service.verify('', null)).resolves.toBe(false);
    await expect(service.verify(PASSWORD, null)).resolves.toBe(false);

    // **The decision not to hash a decoy, pinned.** A decoy would hide "this address has
    // no password" from a timing observer, at the price of a gate slot and 128 MiB per
    // attempt on an address that has no password at all — the exact amplification the
    // gate exists to prevent. This race says so deterministically rather than by
    // measuring milliseconds: the answer arrives within the microtask queue, whereas any
    // scrypt call would have to come back from the threadpool a loop turn later.
    const answered = await Promise.race([
      service.verify(PASSWORD, null).then(() => 'answered'),
      new Promise((resolve) => setImmediate(() => resolve('deferred'))),
    ]);

    expect(answered).toBe('answered');
    // An absent hash is by design, not corruption, so it is not warned about.
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty string', ''],
    ['a bare plaintext password', 'hunter2'],
    ['another algorithm', '$bcrypt$ln=17,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0'],
    ['a missing parameter', '$scrypt$ln=17,r=8,p=1$c2FsdA$ZGlnZXN0'],
    ['a non-numeric parameter', '$scrypt$ln=x,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0'],
    ['a missing digest segment', '$scrypt$ln=17,r=8,p=1,dk=32$c2FsdA'],
    ['an extra segment', '$scrypt$ln=17,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0$extra'],
    ['an empty salt', '$scrypt$ln=17,r=8,p=1,dk=32$$ZGlnZXN0'],
    ['a padded, non-PHC base64 digest', '$scrypt$ln=17,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0=='],
    ['a missing leading delimiter', 'scrypt$ln=17,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0'],
  ])('treats %s as no match and says so once, without echoing it', async (_label, stored) => {
    await expect(makeService().verify('hunter2', stored)).resolves.toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({ reason: 'unparseable' }, expect.any(String));
    // Neither the password nor the stored value may reach a log line.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('hunter2');
  });

  it('refuses a stored parameter set that asks for more memory than this process allows', async () => {
    // 128 * 2^25 * 8 is 32 GiB. A corrupted or tampered row must not be able to turn one
    // sign-in into a multi-gigabyte allocation, so this is refused before OpenSSL sees it.
    const stored = '$scrypt$ln=25,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0';

    await expect(makeService().verify('hunter2', stored)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith({ reason: 'unparseable' }, expect.any(String));
  });

  it('treats parameters scrypt itself refuses as no match', async () => {
    // `ln=0` means N=1, which scrypt rejects: it must be a power of two greater than 1.
    // Well-formed enough to parse, impossible to run.
    const stored = '$scrypt$ln=0,r=8,p=1,dk=32$c2FsdA$ZGlnZXN0';

    await expect(makeService().verify('hunter2', stored)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith({ reason: 'rejected-parameters' }, expect.any(String));
  });

  it('treats a digest shorter than the length it declares as no match', async () => {
    // `dk=32` with a 16-byte digest. Without the length check this is where
    // `timingSafeEqual` would throw rather than answer.
    const encoded = encodeAt('hunter2');
    const truncated = `${encoded.split('$').slice(0, 4).join('$')}$${base64(
      Buffer.alloc(16, 7),
    )}`;

    await expect(makeService().verify('hunter2', truncated)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith({ reason: 'digest-length' }, expect.any(String));
  });
});

describe('the concurrency gate', () => {
  /**
   * Park `count` callers inside the gate and hand back the releases. No hashing happens:
   * the point under test is the counter, not scrypt.
   */
  function occupy(service: PasswordService, count: number) {
    const entered: number[] = [];
    const gates = Array.from({ length: count }, () => deferred());
    const calls = gates.map((gate, index) =>
      service.withSlot(async () => {
        entered.push(index);
        await gate.promise;
        return index;
      }),
    );
    return { entered, gates, calls };
  }

  it('admits callers up to the limit at once', async () => {
    const service = makeService({ PASSWORD_HASH_CONCURRENCY: 2 });
    const { entered, gates, calls } = occupy(service, 2);

    await Promise.resolve();
    expect(entered).toEqual([0, 1]);

    gates.forEach((gate) => gate.resolve());
    await expect(Promise.all(calls)).resolves.toEqual([0, 1]);
  });

  it('queues the caller past the limit until a slot is handed over', async () => {
    const service = makeService({ PASSWORD_HASH_CONCURRENCY: 1 });
    const { entered, gates, calls } = occupy(service, 1);
    await Promise.resolve();

    let queuedEntered = false;
    const queued = service.withSlot(async () => {
      queuedEntered = true;
      return 'queued';
    });

    // Several turns of the event loop, and the third caller is still outside.
    await Promise.resolve();
    await Promise.resolve();
    expect(queuedEntered).toBe(false);
    expect(entered).toEqual([0]);

    gates[0]?.resolve();
    await expect(calls[0]).resolves.toBe(0);
    await expect(queued).resolves.toBe('queued');
    expect(queuedEntered).toBe(true);
  });

  it('hands a released slot to the longest waiter first', async () => {
    const service = makeService({ PASSWORD_HASH_CONCURRENCY: 1 });
    const { gates, calls } = occupy(service, 1);
    await Promise.resolve();

    const admitted: string[] = [];
    const held = deferred();
    const firstWaiter = service.withSlot(async () => {
      admitted.push('first');
      await held.promise;
    });
    const secondWaiter = service.withSlot(async () => {
      admitted.push('second');
    });

    gates[0]?.resolve();
    await calls[0];
    await Promise.resolve();
    // One slot freed, one waiter admitted — and it is the one that arrived first.
    expect(admitted).toEqual(['first']);

    held.resolve();
    await Promise.all([firstWaiter, secondWaiter]);
    expect(admitted).toEqual(['first', 'second']);
  });

  it('gives up with a 503 once the bounded wait elapses', async () => {
    vi.useFakeTimers();
    const service = makeService({
      PASSWORD_HASH_CONCURRENCY: 1,
      PASSWORD_HASH_WAIT_MS: 1_500,
    });
    const { gates, calls } = occupy(service, 1);
    await Promise.resolve();

    const queued = service.withSlot(async () => 'never runs');
    const assertion = expect(queued).rejects.toMatchObject({
      status: 503,
      code: 'service_unavailable',
    });

    await vi.advanceTimersByTimeAsync(1_499);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;

    // The saturation answer says nothing about why, and nothing about the caller.
    await expect(queued).rejects.toThrow(/briefly at capacity/);

    gates[0]?.resolve();
    await calls[0];
  });

  it('releases the slot when the work throws, not only when it succeeds', async () => {
    const service = makeService({
      PASSWORD_HASH_CONCURRENCY: 1,
      PASSWORD_HASH_WAIT_MS: 0,
    });

    await expect(
      service.withSlot(async () => {
        throw new Error('rate limit exceeded');
      }),
    ).rejects.toThrow('rate limit exceeded');

    // If the failed call had kept its slot, this would be a 503 rather than an answer.
    await expect(service.withSlot(async () => 'free')).resolves.toBe('free');
  });

  it('drops a waiter that timed out without leaking its slot', async () => {
    // Once a waiter has given up, the release it was queued for must go to the next
    // waiter — or back to the counter — rather than to a caller that is no longer there.
    const service = makeService({
      PASSWORD_HASH_CONCURRENCY: 1,
      PASSWORD_HASH_WAIT_MS: 0,
    });
    const { gates, calls } = occupy(service, 1);
    await Promise.resolve();

    await expect(service.withSlot(async () => 'never runs')).rejects.toThrow(
      /briefly at capacity/,
    );

    gates[0]?.resolve();
    await calls[0];
    await expect(service.withSlot(async () => 'free')).resolves.toBe('free');
  });

  it('hands the callback the ungated primitives, so the rate limiter can sit in between', async () => {
    // The ordering B8 fixes and edge case 18 depends on: slot first, rate limit second,
    // hash third. `withSlot` is what makes that expressible without a second acquisition.
    const service = makeService({ PASSWORD_HASH_CONCURRENCY: 1 });
    const order: string[] = [];

    const verified = await service.withSlot(async (work: PasswordWork) => {
      order.push('rate limit consumed');
      expect(typeof work.hash).toBe('function');
      return work.verify('hunter2', encodeAt('hunter2'));
    });

    expect(order).toEqual(['rate limit consumed']);
    expect(verified).toBe(true);
  });

  it('gates hash and verify themselves, not only withSlot', async () => {
    // Cheap on purpose: with the only slot held and no wait allowed, both entry points
    // are refused before any scrypt work would start, which is the proof that they take
    // the same gate.
    const service = makeService({
      PASSWORD_HASH_CONCURRENCY: 1,
      PASSWORD_HASH_WAIT_MS: 0,
    });
    const { gates, calls } = occupy(service, 1);
    await Promise.resolve();

    await expect(service.hash('hunter2')).rejects.toThrow(/briefly at capacity/);
    await expect(service.verify('hunter2', encodeAt('hunter2'))).rejects.toThrow(
      /briefly at capacity/,
    );

    gates[0]?.resolve();
    await calls[0];
  });
});

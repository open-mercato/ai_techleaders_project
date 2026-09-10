import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import { ServiceUnavailableError } from '../../http/errors';

/**
 * Password hashing — platform primitives **B9**.
 *
 * `node:crypto`'s `scrypt` at OWASP's parameters, behind a process-global concurrency
 * gate. **No dependency is added.**
 *
 * **Why not `bcryptjs`.** The engineering-standards spec originally named
 * `bcrypt`/`bcryptjs` at cost ≥ 12 and called the extra "~50 ms per login" free. That
 * figure describes the *native* bcrypt binding. `bcryptjs` is pure JavaScript, roughly
 * an order of magnitude slower, and its async API chunks work through `setImmediate` on
 * the **main thread** — so cost 12 stalls the whole Next server for about a second per
 * attempt, on the one route an attacker can hit at will. `scrypt` runs on the libuv
 * threadpool, so a hash occupies a worker rather than the event loop, and it ships with
 * Node. The standards bullet was amended in the same change rather than quietly
 * ignored; the `argon2id` upgrade path it names is unaffected.
 *
 * **Nothing here is ever logged.** Neither a plaintext password nor a stored hash
 * appears in any log line this module writes — the malformed-hash warning below carries
 * a reason code and nothing else.
 */

/**
 * OWASP's Password Storage Cheat Sheet minimum for scrypt: N=2^17, r=8, p=1.
 *
 * `N` is the cost parameter and the only one worth tuning: memory and time both scale
 * linearly with it. `r=8` (block size) and `p=1` (parallelism) are the values the whole
 * ecosystem uses and the ones OWASP's figure is quoted against, so they are named here
 * rather than left as magic arguments at the call site.
 *
 * `LOG2_N` rather than `N` is the stored form: it is what the PHC scrypt encoding uses,
 * it makes "one notch stronger" an increment, and it makes a non-power-of-two `N` —
 * which `scrypt` rejects — unrepresentable.
 */
const LOG2_N = 17;
const COST_N = 2 ** LOG2_N;
const BLOCK_SIZE_R = 8;
const PARALLELISM_P = 1;

/** 32 bytes of digest and 16 bytes of salt: the sizes scrypt's own test vectors use. */
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * **`maxmem` must be raised explicitly or the hash never runs.** scrypt needs about
 * `128 * N * r` bytes — 128 MiB at the parameters above — and Node's default `maxmem`
 * is 32 MiB, so `scrypt(..., { N: 2**17, r: 8, p: 1 })` throws
 * `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` ("memory limit exceeded") before doing any work.
 * 256 MiB leaves one notch of headroom for the next OWASP bump without letting a
 * corrupt stored parameter set ask for an unbounded allocation: `verify` refuses any
 * stored hash whose parameters exceed this same ceiling.
 */
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

/** The algorithm tag in the encoded hash. A second algorithm would add a second tag. */
const ALGORITHM_ID = 'scrypt';

/**
 * The whole stored form: `$scrypt$ln=17,r=8,p=1,dk=32$<salt>$<digest>`.
 *
 * One pattern rather than a `split` plus per-field checks, so that "is this one of ours"
 * is a single decision. The salt and digest alphabets are pinned to unpadded base64,
 * which is also what stops a `$` inside either field from being read as a delimiter.
 *
 * The tag is spelled out rather than interpolated from `ALGORITHM_ID`, so the pattern
 * stays a literal. The two must move together, and the round-trip test at the shipped
 * parameters — hash here, verify here — is what fails if they ever do not.
 *
 * Plain `\d+` for the four numbers on purpose. Everything that survives this regex is
 * still checked — the memory ceiling below, and `scrypt` itself for the rest (`N` must be
 * greater than 1, `r`, `p` and the key length must be positive) — so tightening the regex
 * to catch `r=0` here would duplicate a check that has to exist anyway for the
 * combinations a regex cannot express.
 */
const ENCODED_PATTERN =
  /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+),dk=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * What `ENCODED_PATTERN.exec` returns on a match. The cast in `parseEncodedHash` exists
 * because `noUncheckedIndexedAccess` types every capture as `string | undefined`, and
 * guarding six groups that the pattern guarantees would be six branches no input can
 * reach — untestable code in a file that has to be covered to the last branch.
 */
type EncodedMatch = [
  whole: string,
  log2N: string,
  blockSize: string,
  parallelism: string,
  keyLength: string,
  salt: string,
  digest: string,
];

/** Said to a caller the gate turned away. Deliberately vague about why. */
const GATE_SATURATED =
  'The server is briefly at capacity for password checks. Please try again in a moment.';

/**
 * `promisify` rather than a hand-rolled wrapper — see `derive`. The signature is pinned
 * here because `scrypt`'s promisified type is itself overloaded, and the three-argument
 * overload (the one without `options`) is the one inference picks.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Base64 without padding, as the PHC string format specifies. `Buffer.from(x,'base64')`
 * decodes an unpadded string fine, so only the encoding side needs to say so.
 */
function encodeBase64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '');
}

/**
 * Run scrypt on the libuv threadpool.
 *
 * `promisify` rather than `new Promise((resolve, reject) => scrypt(..., cb))`: the
 * hand-rolled version carries an `if (error)` arm that only an allocation failure deep
 * inside OpenSSL could reach, which is an untestable branch in a file that must be
 * covered to the last one. Delegating to `util.promisify` keeps that arm in Node.
 */
function derive(
  plaintext: string,
  salt: Buffer,
  keyLength: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scryptAsync(plaintext, salt, keyLength, {
    ...params,
    maxmem: MAX_MEMORY_BYTES,
  });
}

/** Every parameter `verify` needs, read back out of a stored hash. */
interface ParsedHash {
  params: { N: number; r: number; p: number };
  salt: Buffer;
  /** The key length the hash *declares*, which is what scrypt is asked to produce. */
  keyLength: number;
  /** The digest actually stored, which may disagree with `keyLength` if the row is corrupt. */
  digest: Buffer;
}

/**
 * Parse `$scrypt$ln=17,r=8,p=1,dk=32$<salt>$<digest>`.
 *
 * Returns `null` — never throws — for anything that is not a well-formed encoding of
 * parameters this process is willing to run. The caller turns that into "does not
 * verify" plus a warning.
 */
function parseEncodedHash(encoded: string): ParsedHash | null {
  const matched = ENCODED_PATTERN.exec(encoded) as EncodedMatch | null;
  if (!matched) {
    return null;
  }

  const [, log2N, blockSize, parallelism, declaredKeyLength, salt, digest] = matched;
  const N = 2 ** Number(log2N);
  const r = Number(blockSize);
  const p = Number(parallelism);

  // The same ceiling `hash` runs under. A stored parameter set that asks for more than
  // this process is configured to allocate is refused here rather than handed to
  // OpenSSL, so a corrupted or tampered row cannot turn one sign-in into a multi-gigabyte
  // allocation. Raising `MAX_MEMORY_BYTES` is what makes a future, stronger parameter set
  // verifiable — which is the deliberate coupling, not an oversight.
  if (128 * N * r > MAX_MEMORY_BYTES) {
    return null;
  }

  return {
    params: { N, r, p },
    salt: Buffer.from(salt, 'base64'),
    keyLength: Number(declaredKeyLength),
    digest: Buffer.from(digest, 'base64'),
  };
}

/**
 * A waiter parked on a full gate: the `resolve` that hands it the slot, and the timer
 * that gives up on its behalf.
 */
interface GateWaiter {
  admit: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The global concurrency gate.
 *
 * At most `limit` hashes are in flight at once; a caller arriving at a full gate is
 * queued FIFO for up to `waitMs` and then rejected with `ServiceUnavailableError`.
 *
 * A released slot is **handed to the head of the queue** rather than freed and
 * re-acquired: `inFlight` is unchanged across the handover, so there is no window in
 * which a newly arriving caller can overtake someone who has already been waiting.
 */
class HashConcurrencyGate {
  private inFlight = 0;
  private readonly queue: GateWaiter[] = [];

  constructor(
    private readonly limit: number,
    private readonly waitMs: number,
  ) {}

  acquire(): Promise<void> {
    if (this.inFlight < this.limit) {
      this.inFlight += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: GateWaiter = {
        admit: resolve,
        timer: setTimeout(() => {
          // The timer only ever fires for a waiter still in the queue — `release`
          // clears it at the moment it dequeues one — so the index is always found.
          this.queue.splice(this.queue.indexOf(waiter), 1);
          reject(new ServiceUnavailableError(GATE_SATURATED));
        }, this.waitMs),
      };
      this.queue.push(waiter);
    });
  }

  release(): void {
    const waiter = this.queue.shift();
    if (!waiter) {
      this.inFlight -= 1;
      return;
    }
    clearTimeout(waiter.timer);
    waiter.admit();
  }
}

/**
 * The hashing primitives, with the gate slot **already held** by the caller.
 *
 * This is what `withSlot` hands to its callback. It exists so the sign-in route can put
 * work *between* acquiring the slot and hashing — specifically consuming the rate limit
 * — without any risk of a second acquisition deadlocking against the first.
 */
export interface PasswordWork {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, storedHash: string | null): Promise<boolean>;
}

export class PasswordService {
  private readonly logger: Logger;
  private readonly gate: HashConcurrencyGate;
  /** Bound once so `withSlot` hands out one stable object rather than a fresh literal. */
  private readonly work: PasswordWork;

  constructor({ env, logger }: { env: AppEnv; logger: Logger }) {
    this.logger = logger;
    this.gate = new HashConcurrencyGate(
      env.PASSWORD_HASH_CONCURRENCY,
      env.PASSWORD_HASH_WAIT_MS,
    );
    this.work = {
      hash: (plaintext) => this.hashHeld(plaintext),
      verify: (plaintext, storedHash) => this.verifyHeld(plaintext, storedHash),
    };
  }

  /**
   * Hold one gate slot for the duration of `run`, which receives the ungated hashing
   * primitives.
   *
   * **The ordering this exists for** (B8, and edge case 18 of the accounts spec):
   * acquire the slot first — a cheap in-memory check — consume the rate limit second,
   * hash third. A 503 from a saturated gate must not have touched the rate-limit
   * counter, or an unrelated burst would lock out users who were merely unlucky:
   *
   * ```ts
   * await passwordService.withSlot(async (work) => {
   *   await rateLimiter.consume(key, SIGN_IN_POLICY);   // 429 if exceeded
   *   return work.verify(plaintext, user.passwordHash);
   * });
   * ```
   *
   * The slot is released in a `finally`, so a rejected rate limit, a thrown hash and a
   * successful one all give it back.
   */
  async withSlot<T>(run: (work: PasswordWork) => Promise<T>): Promise<T> {
    await this.gate.acquire();
    try {
      return await run(this.work);
    } finally {
      this.gate.release();
    }
  }

  /** Hash `plaintext`, taking a gate slot for the duration. */
  hash(plaintext: string): Promise<string> {
    return this.withSlot((work) => work.hash(plaintext));
  }

  /** Check `plaintext` against `storedHash`, taking a gate slot for the duration. */
  verify(plaintext: string, storedHash: string | null): Promise<boolean> {
    return this.withSlot((work) => work.verify(plaintext, storedHash));
  }

  /**
   * The stored form is self-describing: `$scrypt$ln=17,r=8,p=1,dk=32$<salt>$<digest>`,
   * PHC-style, base64 without padding.
   *
   * **The parameters travel with the digest so that raising them stays possible.** A
   * verifier that read `LOG2_N` from this module could only check hashes written by the
   * version of this module it shipped with; the next OWASP bump would invalidate every
   * password in the table. `verify` reads `ln`, `r`, `p` and `dk` back out of the string
   * it was given, so a hash written at today's parameters keeps verifying after the
   * constants above move, and a rehash-on-successful-login can be added later without a
   * migration. `dk` is carried explicitly, rather than inferred from the digest's
   * length, so that a truncated digest is caught as a mismatch instead of silently
   * changing what scrypt is asked to compute.
   */
  private async hashHeld(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const digest = await derive(plaintext, salt, KEY_LENGTH, {
      N: COST_N,
      r: BLOCK_SIZE_R,
      p: PARALLELISM_P,
    });

    const params = `ln=${LOG2_N},r=${BLOCK_SIZE_R},p=${PARALLELISM_P},dk=${KEY_LENGTH}`;
    return `$${ALGORITHM_ID}$${params}$${encodeBase64(salt)}$${encodeBase64(digest)}`;
  }

  private async verifyHeld(plaintext: string, storedHash: string | null): Promise<boolean> {
    // **A null hash never verifies, and never burns comparable time.** A GitHub-only
    // account has `password_hash` null; so does a lookup that found nobody, if the route
    // decides to answer uniformly. Hashing a decoy would close the timing side-channel
    // that tells an attacker "this address has no password" — and it was weighed and
    // rejected, for two reasons. First, a decoy hash costs a gate slot and 128 MiB for
    // an address that has no password at all, which is precisely the amplification the
    // gate exists to prevent: enumerating addresses would saturate the gate and 503 real
    // users. Second, the oracle it would close is already open by design elsewhere —
    // registering an address that belongs to a GitHub-only account answers 409 — so the
    // trade would buy nothing while adding a denial-of-service lever. What bounds
    // enumeration is the per-IP and per-email rate limiter in front of this call.
    if (storedHash === null) {
      return false;
    }

    const parsed = parseEncodedHash(storedHash);
    if (!parsed) {
      // Neither the hash nor the password is logged — only that a stored value was not
      // in the expected shape, which is a data bug worth seeing. It is a warning rather
      // than a thrown 500 because the caller is a sign-in attempt: the honest answer to
      // "is this the right password" for an unreadable hash is "no".
      this.logger.warn(
        { reason: 'unparseable' },
        'stored password hash is not in the expected format; treating it as no match',
      );
      return false;
    }

    let candidate: Buffer;
    try {
      candidate = await derive(plaintext, parsed.salt, parsed.keyLength, parsed.params);
    } catch {
      // Parameters that are well-formed but that scrypt refuses — `N` of 1, a zero
      // block size, a zero key length. Same treatment as an unparseable hash.
      this.logger.warn(
        { reason: 'rejected-parameters' },
        'stored password hash names parameters scrypt refuses; treating it as no match',
      );
      return false;
    }

    // `timingSafeEqual` *throws* on a length mismatch, so the lengths are compared
    // first. They can only differ if the stored digest was truncated or padded after it
    // was written, since `keyLength` is what produced `candidate` — a corrupt row, not a
    // wrong password, and reporting it early leaks nothing an attacker did not supply.
    if (candidate.length !== parsed.digest.length) {
      this.logger.warn(
        { reason: 'digest-length' },
        'stored password hash does not carry the digest length it declares; treating it as no match',
      );
      return false;
    }

    // Constant-time in the length of the digest: a byte-by-byte `===` would leak how far
    // a forged digest matched, one attempt at a time.
    return timingSafeEqual(candidate, parsed.digest);
  }
}

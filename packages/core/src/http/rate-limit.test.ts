import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@devmentor/db';
import type { AppEnv } from '../config/env';
import type { Logger } from '../logger';
import type { Clock } from '../time/clock';
import { PasswordService } from '../services/auth/password.service';
import { RATE_LIMITED_MESSAGE, ServiceUnavailableError, TooManyRequestsError } from './errors';
import {
  RateLimiter,
  REGISTRATION_IP_POLICY,
  SIGN_IN_EMAIL_POLICY,
  SIGN_IN_IP_POLICY,
  VERIFICATION_RESEND_EMAIL_POLICY,
  rateLimitKey,
  type RateLimitPolicy,
} from './rate-limit';

/**
 * **What is proven here and what is proven against a real database.**
 *
 * `consume` is one raw statement, so this suite splits along that seam. Everything the
 * *module* decides is proven here with a fake `EntityManager`: which key is charged, which
 * boundaries are handed to PostgreSQL, when a returned count becomes a 429, that a `null`
 * key charges nothing, and — the one that matters most — that a saturated hashing gate
 * never reaches the counter at all.
 *
 * What the *statement* decides — that the rollover `CASE` resets rather than increments,
 * that the pruning `DELETE` removes exactly the rows older than the longest window, and
 * that concurrent callers serialise on the primary key instead of both writing `5` — is
 * SQL behaviour, and asserting it against a hand-written JavaScript model of PostgreSQL
 * would prove only that the model matches itself. It is proven in
 * `tests/integration/migrations.integration.test.ts`, against the real table this
 * migration creates, with real concurrent connections.
 *
 * The fake below therefore counts attempts per key and nothing else: it is deliberately
 * *not* a window implementation, so no case here can accidentally start depending on one.
 */

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-09-10T12:00:00.000Z');
const clock: Clock = { now: () => NOW };

/** The counter store, plus the `em` the limiter talks to. */
function countingEm() {
  const counts = new Map<string, number>();
  const execute = vi.fn(async (_sql: string, params: unknown[]) => {
    // Parameter 1 is the key excluded from the prune; parameter 2 is the key inserted.
    // They are the same string, and asserting that here is what keeps the SQL's two
    // occurrences from drifting apart.
    expect(params[1]).toBe(params[2]);
    const key = params[2] as string;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return [{ count: next, retry_after_seconds: 42 }];
  });
  return { counts, execute, em: { execute } as unknown as EntityManager };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

/** `identifier` hashed the way a key is expected to hash it. */
function sha256Hex(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex');
}

describe('rateLimitKey', () => {
  it('is <scope>:<kind>:<sha256hex of the lower-cased identifier>', () => {
    expect(rateLimitKey('sign-in', 'email', 'ada@devmentor.dev')).toBe(
      `sign-in:email:${sha256Hex('ada@devmentor.dev')}`,
    );
  });

  it('never puts the raw identifier anywhere in the key', () => {
    const email = 'ada.lovelace@devmentor.dev';
    const ip = '203.0.113.7';

    const emailKey = rateLimitKey('sign-in', 'email', email) as string;
    const ipKey = rateLimitKey('sign-in', 'ip', ip) as string;

    // The whole point of the hash: an operator reading `auth_rate_limits` learns which
    // buckets are hot and nothing about who is in them.
    expect(emailKey).not.toContain(email);
    expect(emailKey).not.toContain('ada');
    expect(emailKey).not.toContain('devmentor.dev');
    expect(emailKey).not.toContain('@');
    expect(ipKey).not.toContain(ip);
    expect(ipKey).not.toContain('203');
    // And what is left is a scope, a kind and 64 hex characters.
    expect(emailKey).toMatch(/^sign-in:email:[0-9a-f]{64}$/);
    expect(ipKey).toMatch(/^sign-in:ip:[0-9a-f]{64}$/);
  });

  it('lower-cases before hashing, so capitalisation is not a bypass', () => {
    expect(rateLimitKey('sign-in', 'email', 'ADA@Devmentor.DEV')).toBe(
      rateLimitKey('sign-in', 'email', 'ada@devmentor.dev'),
    );
  });

  it('keeps kinds and scopes in separate buckets', () => {
    // Same identifier string, three different buckets: an IP that happened to look like
    // an email would still not share a counter with it, and a registration attempt does
    // not spend a sign-in allowance.
    const asEmail = rateLimitKey('sign-in', 'email', 'shared');
    const asIp = rateLimitKey('sign-in', 'ip', 'shared');
    const onRegister = rateLimitKey('register', 'ip', 'shared');

    expect(new Set([asEmail, asIp, onRegister]).size).toBe(3);
  });

  it('answers null for a null identifier, which is the skipped per-IP key', () => {
    expect(rateLimitKey('sign-in', 'ip', null)).toBeNull();
  });
});

describe('clientIpFromHeaders', () => {
  // A fresh module per case: the "warned once" flag is module-level *by design* (once per
  // process, not once per request), so it has to be reset the way a process resets it.
  let subject: typeof import('./rate-limit');
  let logger: Logger;
  let warn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    subject = await import('./rate-limit');
    logger = makeLogger();
    warn = logger.warn as unknown as ReturnType<typeof vi.fn>;
  });

  function headers(forwarded?: string): Headers {
    return new Headers(forwarded === undefined ? {} : { 'x-forwarded-for': forwarded });
  }

  it('trusts nothing at 0 hops, even when the header is present', () => {
    // The default. Without a proxy in front, `x-forwarded-for` is whatever the client
    // typed, so there is no address here worth counting against.
    expect(
      subject.clientIpFromHeaders(headers('203.0.113.7'), { trustedProxyHops: 0, logger }),
    ).toBeNull();
  });

  it('takes the rightmost entry at 1 hop', () => {
    expect(
      subject.clientIpFromHeaders(headers('198.51.100.1'), { trustedProxyHops: 1, logger }),
    ).toBe('198.51.100.1');
    expect(warn).not.toHaveBeenCalled();
  });

  it('takes the second-from-right entry at 2 hops', () => {
    expect(
      subject.clientIpFromHeaders(headers('203.0.113.7, 198.51.100.1, 10.0.0.9'), {
        trustedProxyHops: 2,
        logger,
      }),
    ).toBe('198.51.100.1');
  });

  it('ignores a value the client forged to the left of the trusted entry', () => {
    // The attack the right-to-left count exists to stop: a client that sets its own
    // `x-forwarded-for` gets that value *prepended to*, never substituted for, what the
    // proxy appends. Reading the leftmost entry — the conventional "original client"
    // position — would hand every request a bucket of its own choosing.
    const forged = '9.9.9.9, 8.8.8.8, 7.7.7.7';
    const real = subject.clientIpFromHeaders(headers(`${forged}, 198.51.100.1`), {
      trustedProxyHops: 1,
      logger,
    });

    expect(real).toBe('198.51.100.1');
    expect(real).not.toBe('9.9.9.9');
  });

  it('tolerates whitespace and empty entries', () => {
    expect(
      subject.clientIpFromHeaders(headers('  203.0.113.7 , , 198.51.100.1  '), {
        trustedProxyHops: 1,
        logger,
      }),
    ).toBe('198.51.100.1');
  });

  it('answers null when the header is absent', () => {
    expect(
      subject.clientIpFromHeaders(headers(), { trustedProxyHops: 1, logger }),
    ).toBeNull();
  });

  it('answers null when the chain is shorter than the trusted hop count', () => {
    // Two proxies configured, one entry present: the request did not arrive the
    // configured way, so nothing in the header is at a known position.
    expect(
      subject.clientIpFromHeaders(headers('198.51.100.1'), { trustedProxyHops: 2, logger }),
    ).toBeNull();
  });

  it('warns exactly once per process, whatever the reason', () => {
    // Edge case 17b. Three refusals, two different reasons, one log line: the warning is
    // an operator's cue to set TRUSTED_PROXY_HOPS, not a per-request event.
    subject.clientIpFromHeaders(headers('203.0.113.7'), { trustedProxyHops: 0, logger });
    subject.clientIpFromHeaders(headers(), { trustedProxyHops: 1, logger });
    subject.clientIpFromHeaders(headers('a'), { trustedProxyHops: 4, logger });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { reason: 'no-trusted-proxy-hops' },
      expect.stringContaining('TRUSTED_PROXY_HOPS'),
    );
  });

  it('names the reason it could not derive an address', () => {
    subject.clientIpFromHeaders(headers('198.51.100.1'), { trustedProxyHops: 3, logger });

    expect(warn).toHaveBeenCalledWith(
      { reason: 'header-shorter-than-trusted-hops' },
      expect.any(String),
    );
  });
});

describe('the policies', () => {
  it('are the table the spec fixes', () => {
    expect(SIGN_IN_IP_POLICY).toEqual({ limit: 10, windowMs: 15 * 60_000 });
    expect(SIGN_IN_EMAIL_POLICY).toEqual({ limit: 5, windowMs: 15 * 60_000 });
    expect(REGISTRATION_IP_POLICY).toEqual({ limit: 5, windowMs: HOUR_MS });
    expect(VERIFICATION_RESEND_EMAIL_POLICY).toEqual({ limit: 3, windowMs: HOUR_MS });
  });
});

describe('RateLimiter.consume', () => {
  const KEY = 'sign-in:email:abc';

  it('passes every attempt up to and including the limit', async () => {
    const { em, execute } = countingEm();
    const limiter = new RateLimiter({ em, clock });

    for (let attempt = 1; attempt <= SIGN_IN_EMAIL_POLICY.limit; attempt += 1) {
      await expect(limiter.consume(KEY, SIGN_IN_EMAIL_POLICY)).resolves.toBeUndefined();
    }

    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('refuses the attempt after the limit with a 429 carrying retryAfterSeconds', async () => {
    const { em } = countingEm();
    const limiter = new RateLimiter({ em, clock });
    const policy: RateLimitPolicy = { limit: 2, windowMs: 15 * 60_000 };

    await limiter.consume(KEY, policy);
    await limiter.consume(KEY, policy);

    const refusal = await limiter.consume(KEY, policy).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(TooManyRequestsError);
    const error = refusal as TooManyRequestsError;
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.headers).toEqual({ 'Retry-After': '42' });
    expect(error.message).toBe(RATE_LIMITED_MESSAGE);
  });

  it('keeps counting past the limit and never refunds a spent attempt', async () => {
    const { em, counts } = countingEm();
    const limiter = new RateLimiter({ em, clock });
    const policy: RateLimitPolicy = { limit: 1, windowMs: 15 * 60_000 };

    await limiter.consume(KEY, policy);
    await expect(limiter.consume(KEY, policy)).rejects.toThrow(TooManyRequestsError);
    await expect(limiter.consume(KEY, policy)).rejects.toThrow(TooManyRequestsError);

    // Three attempts, three increments: a refusal costs an attempt too, and a success
    // never gives one back.
    expect(counts.get(KEY)).toBe(3);
  });

  it('keeps the per-IP and per-email buckets independent', async () => {
    const { em, counts } = countingEm();
    const limiter = new RateLimiter({ em, clock });
    const ipKey = rateLimitKey('sign-in', 'ip', '198.51.100.1');
    const emailKey = rateLimitKey('sign-in', 'email', 'ada@devmentor.dev');

    // Spend the whole per-email allowance.
    for (let attempt = 0; attempt < SIGN_IN_EMAIL_POLICY.limit; attempt += 1) {
      await limiter.consume(emailKey, SIGN_IN_EMAIL_POLICY);
    }
    await expect(limiter.consume(emailKey, SIGN_IN_EMAIL_POLICY)).rejects.toThrow(
      TooManyRequestsError,
    );

    // The IP bucket for the same request is untouched: a second address from the same
    // office still signs in.
    await expect(limiter.consume(ipKey, SIGN_IN_IP_POLICY)).resolves.toBeUndefined();
    expect(counts.get(emailKey as string)).toBe(6);
    expect(counts.get(ipKey as string)).toBe(1);
  });

  it('charges nothing at all for a null key', async () => {
    // The no-derivable-IP case: the per-IP bucket does not exist, so no statement runs
    // and no row is created for a key of `"null"` or `""`.
    const { em, execute } = countingEm();
    const limiter = new RateLimiter({ em, clock });

    await expect(limiter.consume(null, SIGN_IN_IP_POLICY)).resolves.toBeUndefined();

    expect(execute).not.toHaveBeenCalled();
  });

  it('issues one statement that upserts, rolls the window over and prunes', async () => {
    const { em, execute } = countingEm();
    const limiter = new RateLimiter({ em, clock });

    await limiter.consume(KEY, SIGN_IN_EMAIL_POLICY);

    const sql = execute.mock.calls[0]![0] as string;
    // One statement, not three: a read-then-write would let two concurrent attempts both
    // read the same count and both write the same increment.
    expect(sql).toContain('on conflict ("key") do update set');
    expect(sql).toContain('returning');
    // The rollover lives in the same statement, as a CASE rather than a prior SELECT.
    expect(sql).toContain('case when "auth_rate_limits"."window_start" <= ? then 1');
    // The prune rides along as a data-modifying CTE, and never touches our own row.
    expect(sql).toContain('delete from "auth_rate_limits"');
    expect(sql).toContain('where "window_start" < ? and "key" <> ?');
  });

  it('hands PostgreSQL the window boundary, the prune boundary and the clock instant', async () => {
    const { em, execute } = countingEm();
    const limiter = new RateLimiter({ em, clock });

    await limiter.consume(KEY, SIGN_IN_EMAIL_POLICY);

    const windowExpiredAt = new Date(NOW.getTime() - SIGN_IN_EMAIL_POLICY.windowMs);
    expect(execute.mock.calls[0]![1]).toEqual([
      // Prune: rows older than the longest configured window, excluding this key.
      new Date(NOW.getTime() - HOUR_MS),
      KEY,
      KEY,
      // The instant a new window opens at.
      NOW,
      // The two arms of the rollover CASE.
      windowExpiredAt,
      windowExpiredAt,
      // `retry_after_seconds` arithmetic: now, and the window in whole seconds.
      NOW,
      900,
    ]);
  });

  it('takes the instant from the injected clock, never from the host', async () => {
    const { em, execute } = countingEm();
    const other = new Date('2019-01-01T00:00:00.000Z');
    const limiter = new RateLimiter({ em, clock: { now: () => other } });

    await limiter.consume(KEY, SIGN_IN_EMAIL_POLICY);

    expect(execute.mock.calls[0]![1]).toContain(other);
  });

  it('prunes by the longest window even when this policy is the shortest', async () => {
    // Sign-in's window is fifteen minutes, but a registration counter is live for an
    // hour. Pruning at fifteen minutes would hand every registration bucket a free reset
    // four times an hour.
    const { em, execute } = countingEm();
    const limiter = new RateLimiter({ em, clock });

    await limiter.consume(KEY, SIGN_IN_EMAIL_POLICY);
    await limiter.consume(KEY, REGISTRATION_IP_POLICY);

    const shortPolicyPrune = (execute.mock.calls[0]![1] as unknown[])[0];
    const longPolicyPrune = (execute.mock.calls[1]![1] as unknown[])[0];
    expect(shortPolicyPrune).toEqual(new Date(NOW.getTime() - HOUR_MS));
    expect(longPolicyPrune).toEqual(shortPolicyPrune);
  });
});

describe('the gate → limit → hash ordering', () => {
  /**
   * Edge case 18, asserted rather than described.
   *
   * The real `PasswordService` gate and the real `RateLimiter` are composed exactly as a
   * sign-in route will compose them. The gate is sized at one slot with no queueing, so
   * the second caller is refused with a 503 — and the assertion is that its attempt never
   * reached the counter. If the order were ever inverted, an unrelated burst of traffic
   * would silently spend other people's allowances and lock them out for fifteen minutes.
   */
  function makeGate(): PasswordService {
    return new PasswordService({
      env: {
        PASSWORD_HASH_CONCURRENCY: 1,
        PASSWORD_HASH_WAIT_MS: 0,
      } as unknown as AppEnv,
      logger: makeLogger(),
    });
  }

  it('does not increment a counter when the hashing gate turns the request away', async () => {
    const passwordService = makeGate();
    const { em, counts, execute } = countingEm();
    const limiter = new RateLimiter({ em, clock });
    const key = rateLimitKey('sign-in', 'email', 'ada@devmentor.dev');

    let releaseFirst!: () => void;
    const firstIsHolding = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    // The first caller takes the only slot, spends one attempt, and parks there.
    const first = passwordService.withSlot(async () => {
      await limiter.consume(key, SIGN_IN_EMAIL_POLICY);
      await firstIsHolding;
      return 'held';
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(counts.get(key as string)).toBe(1);

    // The second caller finds the gate full. It must fail before `consume` runs.
    await expect(
      passwordService.withSlot(async () => {
        await limiter.consume(key, SIGN_IN_EMAIL_POLICY);
        return 'never';
      }),
    ).rejects.toThrow(ServiceUnavailableError);

    expect(counts.get(key as string)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(first).resolves.toBe('held');
  });

  it('still spends the attempt when the credential check itself fails', async () => {
    // The other half of the ordering: once the slot is held, the counter is charged
    // *before* any credential work, so a wrong password costs an attempt and the counter
    // never reveals whether the address exists.
    const passwordService = makeGate();
    const { em, counts } = countingEm();
    const limiter = new RateLimiter({ em, clock });
    const key = rateLimitKey('sign-in', 'email', 'nobody@devmentor.dev');

    await expect(
      passwordService.withSlot(async (work) => {
        await limiter.consume(key, SIGN_IN_EMAIL_POLICY);
        return work.verify('whatever', null);
      }),
    ).resolves.toBe(false);

    expect(counts.get(key as string)).toBe(1);
  });
});

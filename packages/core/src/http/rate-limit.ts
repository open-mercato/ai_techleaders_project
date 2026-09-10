import { createHash } from 'node:crypto';
import type { EntityManager } from '@devmentor/db';
import type { Logger } from '../logger';
import type { Clock } from '../time/clock';
import { TooManyRequestsError } from './errors';

/**
 * Brute-force rate limiting — platform primitives **B8**.
 *
 * PostgreSQL-backed fixed-window counters, per client IP **and** per email address,
 * driven by the injected `Clock`. The counter lives in the database rather than in a
 * process-local `Map` for two reasons that a `Map` cannot answer: it survives a restart,
 * and it is shared by every app instance, so a limit of five is five for the deployment
 * rather than five *per process*. Redis would do the same job, but adding an
 * infrastructure dependency for four counters on one route group is not a trade this
 * project needs to make.
 *
 * There is no cooldown, no backoff curve and no ban list. The window *is* the behaviour.
 *
 * **Every attempt counts, and the counter never decrements.** A successful sign-in does
 * not refund the attempt it spent. That is deliberate: a refund would make the limit
 * unenforceable for an attacker who occasionally guesses right, and — worse — it would
 * make the counter's value depend on whether the credential check passed, which is a
 * timing- and state-observable oracle for "that password was correct". The cost is that a
 * legitimate user who mistypes their password ten times in fifteen minutes waits; that is
 * the intended trade, and the window is short.
 */

/** How many attempts a bucket may make, and over how long a window. */
export interface RateLimitPolicy {
  /** The number of attempts *permitted* in one window. The `limit + 1`-th is refused. */
  limit: number;
  windowMs: number;
}

const MINUTE_MS = 60_000;

/**
 * The policies, as named constants rather than numbers at the call sites.
 *
 * Conservative on purpose: every one of these is easy to loosen after a real support
 * complaint and impossible to tighten after a credential-stuffing run. The per-IP limits
 * are looser than the per-email ones because one IP can legitimately be a whole office,
 * while five failed attempts against a *single address* in fifteen minutes is already an
 * unusual thing for its owner to do.
 */
export const SIGN_IN_IP_POLICY: RateLimitPolicy = { limit: 10, windowMs: 15 * MINUTE_MS };
export const SIGN_IN_EMAIL_POLICY: RateLimitPolicy = { limit: 5, windowMs: 15 * MINUTE_MS };
export const REGISTRATION_IP_POLICY: RateLimitPolicy = { limit: 5, windowMs: 60 * MINUTE_MS };
export const VERIFICATION_RESEND_EMAIL_POLICY: RateLimitPolicy = {
  limit: 3,
  windowMs: 60 * MINUTE_MS,
};

/**
 * The longest window any policy above uses, and therefore the age past which a row can
 * never influence a decision again.
 *
 * Derived rather than written as `60 * MINUTE_MS`, so that adding a policy with a longer
 * window cannot silently start pruning rows that are still live — which would hand every
 * bucket on that policy a free reset.
 */
const LONGEST_WINDOW_MS = Math.max(
  SIGN_IN_IP_POLICY.windowMs,
  SIGN_IN_EMAIL_POLICY.windowMs,
  REGISTRATION_IP_POLICY.windowMs,
  VERIFICATION_RESEND_EMAIL_POLICY.windowMs,
);

/** Which action is being limited. Part of the key, so the buckets never mix. */
export type RateLimitScope = 'sign-in' | 'register' | 'verify-resend';

/** What the bucket is keyed on. */
export type RateLimitKind = 'ip' | 'email';

/**
 * Build a bucket key: `<scope>:<kind>:<sha256hex of the lower-cased identifier>`.
 *
 * **No raw identifier ever reaches the table.** An operator reading `auth_rate_limits`,
 * or anyone holding a backup of it, sees which buckets are hot and learns nothing about
 * who is in them — no email address, no IP address. That matters because this table is
 * written for people who are *not* users of the product: failed sign-ins for addresses
 * that have no account, and addresses an attacker is enumerating. Storing those in the
 * clear would create a list of "email addresses someone tried here", which is a data set
 * this project has no reason to hold.
 *
 * The hash is unsalted and therefore reversible by dictionary attack for an adversary who
 * already has the candidate address. That is fine and is not what the hashing is for: the
 * property being bought is that the column is not *itself* a readable list, and a salt
 * would break the only thing the key must do, which is be the same string on the next
 * request.
 *
 * Lower-casing before hashing puts `A@x.com` and `a@x.com` in one bucket — otherwise
 * alternating capitalisation would be a one-line bypass. It is harmless for an IP, which
 * has no upper case.
 *
 * A `null` identifier yields a `null` key, which `consume` treats as "no bucket to
 * charge". That is the no-derivable-IP case (accounts spec, edge case 17b), and routing
 * it through the key builder rather than an `if` at every call site is what keeps a route
 * from forgetting it.
 */
export function rateLimitKey(
  scope: RateLimitScope,
  kind: RateLimitKind,
  identifier: string | null,
): string | null {
  if (identifier === null) {
    return null;
  }
  const digest = createHash('sha256').update(identifier.toLowerCase()).digest('hex');
  return `${scope}:${kind}:${digest}`;
}

/**
 * Has this process already complained that it cannot see a client IP? Module-level
 * because the requirement is *once per process*, and `RateLimiter` is scoped per request:
 * an instance field would warn on every attempt and drown the log.
 */
let noClientIpWarned = false;

function withoutClientIp(logger: Logger, reason: string): null {
  if (!noClientIpWarned) {
    noClientIpWarned = true;
    logger.warn(
      { reason },
      'no client IP could be derived from x-forwarded-for: per-IP rate limiting is ' +
        'disabled for this process and only the per-email limits apply. Set ' +
        'TRUSTED_PROXY_HOPS to the number of reverse proxies in front of this app.',
    );
  }
  return null;
}

/**
 * The client's IP address, or `null` when none can be trusted.
 *
 * A Next route handler's `Request` carries no socket address, so the only candidate is
 * `x-forwarded-for` — a header the client itself can set. Reading the **leftmost** entry,
 * which is the conventional "original client" position and what most snippets do, would
 * therefore make the per-IP limit a no-op: an attacker sends
 * `x-forwarded-for: 1.2.3.4` with a fresh value on every request and lands in a fresh
 * bucket each time. Nothing downstream strips a header a client supplied; a proxy
 * **appends** to it.
 *
 * So the count runs from the right, where only infrastructure writes. `TRUSTED_PROXY_HOPS`
 * is how many proxies sit in front of this app, and the Nth-from-right entry is the
 * address the outermost *trusted* proxy observed:
 *
 * - `0` (the default) trusts nothing. There is no socket address to fall back to, so the
 *   answer is `null` and per-IP limiting is off. Deliberately fail-open on this one axis:
 *   the alternative — bucketing everyone into one forged-or-absent key — would let one
 *   attacker lock out every user of the deployment, and the per-email limit still applies.
 * - `1` takes the rightmost entry: the address our own load balancer saw the connection
 *   come from. Anything the client forged sits to the left of it and is ignored.
 * - `2` takes the second from the right, and so on.
 *
 * A header with fewer entries than there are trusted hops means the request did not
 * arrive through the configured chain, so nothing in it is at a known position and the
 * answer is `null` rather than a guess.
 */
export function clientIpFromHeaders(
  headers: Headers,
  { trustedProxyHops, logger }: { trustedProxyHops: number; logger: Logger },
): string | null {
  if (trustedProxyHops < 1) {
    return withoutClientIp(logger, 'no-trusted-proxy-hops');
  }

  const forwarded = headers.get('x-forwarded-for');
  const entries = (forwarded ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  // Nth from the right, 1-indexed: `trustedProxyHops = 1` is the last entry.
  const candidate = entries[entries.length - trustedProxyHops];
  if (candidate === undefined) {
    return withoutClientIp(logger, 'header-shorter-than-trusted-hops');
  }
  return candidate;
}

/** What one `consume` needs back from the database. */
interface ConsumeResult {
  count: number;
  retry_after_seconds: number;
}

/**
 * Check-and-increment in **one statement**, because a read followed by a write is a
 * bypass rather than a race worth tolerating: two attempts that both read `count = 4`
 * would both write `5`, and a burst of concurrent requests — exactly what a credential
 * stuffer sends — would spend most of its attempts for free.
 *
 * `INSERT … ON CONFLICT (key) DO UPDATE` is what makes it atomic. PostgreSQL takes a row
 * lock on the conflicting row and evaluates the `SET` expressions against the **latest**
 * committed version of it, so concurrent callers serialise on the primary key and each
 * one sees its predecessor's increment. **The window rollover is inside that same
 * statement** for the same reason: expressing it as "read the row, decide whether the
 * window expired, then write" would reopen the gap the upsert closes, and two attempts
 * arriving at an expired window would each reset the count to 1 instead of 1 then 2.
 * Here the `CASE` is evaluated under the row lock, so the first attempt resets the window
 * and the second increments the window the first just created.
 *
 * The `DELETE` is a data-modifying CTE, so it travels in the same statement and the same
 * transaction, and PostgreSQL runs it to completion whether or not the primary query
 * reads its output. It drops every row older than the longest configured window — rows
 * that can no longer influence any decision. At this project's volume that is one indexed
 * delete on a tiny table; a probabilistic or scheduled sweep would be machinery for a
 * problem that does not exist yet.
 *
 * **It excludes this call's own key**, which is not an optimisation. Deleting a row and
 * then landing on it with `ON CONFLICT DO UPDATE` in the same command is exactly the
 * "cannot affect row a second time" situation PostgreSQL refuses, and the exclusion makes
 * it unreachable. Nothing is lost: an expired row for our own key is reset by the `CASE`
 * above, which is the same outcome deleting it would have produced.
 *
 * `retry_after_seconds` is computed in SQL rather than from a returned timestamp, so the
 * value is an `int4` (a JavaScript `number` through node-postgres) instead of a driver
 * -dependent timestamp representation that would have to be parsed back into a `Date`.
 * `greatest(1, …)` keeps `Retry-After: 0` — which some clients read as "retry now" —
 * off the wire.
 */
const CONSUME_SQL = `with pruned as (
  delete from "auth_rate_limits"
  where "window_start" < ? and "key" <> ?
)
insert into "auth_rate_limits" ("key", "window_start", "count")
values (?, ?, 1)
on conflict ("key") do update set
  "count" = case when "auth_rate_limits"."window_start" <= ? then 1 else "auth_rate_limits"."count" + 1 end,
  "window_start" = case when "auth_rate_limits"."window_start" <= ? then excluded."window_start" else "auth_rate_limits"."window_start" end
returning
  "count",
  greatest(1, ceil(extract(epoch from "window_start" - ?) + ?))::int as "retry_after_seconds"`;

export class RateLimiter {
  private readonly em: EntityManager;
  private readonly clock: Clock;

  constructor({ em, clock }: { em: EntityManager; clock: Clock }) {
    this.em = em;
    this.clock = clock;
  }

  /**
   * Charge one attempt to `key` and refuse it with `TooManyRequestsError` once the
   * policy's allowance is spent.
   *
   * A `null` key is a no-op — the bucket does not exist, so there is nothing to charge.
   * The only producer of one is `rateLimitKey` with no derivable client IP, and treating
   * it here rather than at each call site is what makes "skip the per-IP key, keep the
   * per-email key" a property of the limiter instead of an `if` a future route can forget.
   *
   * **Where this call belongs, and why the order is not negotiable** (B8, and edge case 18
   * of the accounts spec): the password gate slot is acquired first, this runs second, and
   * hashing happens third — see `PasswordService.withSlot`. A request turned away by a
   * saturated gate gets a retryable 503 and must not have spent an attempt, or an
   * unrelated traffic spike would lock out users who did nothing wrong. Consuming *before*
   * any credential work is equally deliberate: the counter must not depend on whether the
   * address exists or the password matched.
   */
  async consume(key: string | null, policy: RateLimitPolicy): Promise<void> {
    if (key === null) {
      return;
    }

    const now = this.clock.now();
    // A row is expired when its window opened at or before this instant.
    const windowExpiredAt = new Date(now.getTime() - policy.windowMs);
    const pruneBefore = new Date(now.getTime() - LONGEST_WINDOW_MS);

    const rows = await this.em.execute<ConsumeResult[]>(CONSUME_SQL, [
      pruneBefore,
      key,
      key,
      now,
      windowExpiredAt,
      windowExpiredAt,
      now,
      policy.windowMs / 1000,
    ]);

    // `INSERT … ON CONFLICT DO UPDATE` always inserts or updates exactly one row, so the
    // `RETURNING` clause always yields exactly one. The non-null assertion states that
    // rather than guarding a branch no database can produce — an untestable branch in a
    // file that is covered to the last one.
    const { count, retry_after_seconds: retryAfterSeconds } = rows[0]!;

    if (count > policy.limit) {
      throw new TooManyRequestsError(retryAfterSeconds);
    }
  }
}

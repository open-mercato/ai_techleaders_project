import { z } from 'zod';

/**
 * Split a comma-separated allowlist into normalized entries.
 *
 * Normalization happens **once, at parse time** rather than on every comparison: the
 * operator allowlist is consulted live on every guarded request (D19), and doing the
 * splitting/trimming/case-folding here means every consumer compares against an
 * already-canonical list instead of re-deriving the same rules per call site.
 */
function parseEmailList(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Application-wide environment schema. This is the single source of truth for config
 * across the app — nothing outside `core` (and `db`'s own narrow copy) should read
 * `process.env` directly. Add new config here so it is validated once at boot.
 *
 * **Integration credentials are `optional()` here on purpose.** Per B6 of
 * `.ai/specs/2026-09-04-platform-primitives.md`, *missing* configuration fails closed
 * at the route that needs it (an absent `GITHUB_CLIENT_SECRET` must not take the
 * marketing site down), and the production-only requirement for `SESSION_SECRET` is
 * asserted at container creation, not here. Only *dangerous* configuration — a test
 * double selected outside an integration run — fails at boot, in the `superRefine`
 * below.
 */
const appEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().default('DevMentor'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Database — mirrors packages/db `env.ts`. Kept here too so config validation is
    // centralised; `db` reads its own copy for CLI use without importing `core`.
    DATABASE_URL: z.string().url().optional(),
    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().default('devmentor'),
    DB_USER: z.string().default('devmentor'),
    DB_PASSWORD: z.string().default('devmentor'),

    // --- Sessions ---
    // Signs the session cookie and the short-lived purpose tokens. 32 characters is
    // the floor for an HMAC key we would be willing to ship; a shorter one is a
    // dangerous value, so it is rejected here rather than silently accepted.
    // Absent is allowed (see the class comment) — `createContainer` is what refuses to
    // boot a production process without it.
    SESSION_SECRET: z.string().min(32).optional(),
    // Verified but never issued, so a rotation keeps live sessions valid for the rest
    // of their lifetime.
    SESSION_SECRET_PREVIOUS: z.string().min(32).optional(),

    // --- GitHub OAuth ---
    // Optional by design: without them the GitHub adapter refuses with a
    // `ServiceUnavailableError`, which `/api/auth/github` — a browser-navigated route —
    // turns into a redirect to `/sign-in?error=unavailable` rather than a JSON 503. The
    // rest of the app builds, boots and serves.
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    // --- Deployment identity and authorization ---
    // Comma-separated founder addresses. `operator` authority is derived live from
    // this list on every guarded request; the stored role is only a cache (D19).
    OPERATOR_EMAILS: z.string().default('').transform(parseEmailList),
    // Absolute origin used to build OAuth redirect URIs and links in outbound mail.
    // The protocol is pinned: a bare `localhost:3000` parses as a URL with the scheme
    // `localhost:`, which would sail through a plain `.url()` and then produce redirect
    // URIs GitHub rejects.
    APP_URL: z.string().url({ protocol: /^https?$/ }).default('http://localhost:3000'),
    // How many reverse proxies sit in front of the app, so the rate limiter can take
    // the client IP Nth-from-right out of `x-forwarded-for`. `0` means trust nothing.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

    // --- Password hashing (B9) ---
    // How many `scrypt` hashes may be in flight in this process at once. The bound is
    // memory, not CPU: at the OWASP parameters this project fixes (N=2^17, r=8, p=1)
    // one hash holds 128 MiB for its whole duration, so the default of 2 caps the
    // hashing path at ~256 MiB. It cannot be left unbounded, because the rate limiter
    // in front of it is keyed per IP *and* per email rather than globally — a few dozen
    // distinct addresses each within their own limit would otherwise be several
    // gigabytes of concurrent allocation. Raising it past `UV_THREADPOOL_SIZE`
    // (4 by default) buys queueing inside libuv rather than more parallelism, so raise
    // both or neither. Must be at least 1: zero would admit nobody, ever.
    PASSWORD_HASH_CONCURRENCY: z.coerce.number().int().positive().default(2),
    // How long a request may wait for a free slot before the gate gives up with
    // `503 service_unavailable`. A caller that has already queued this long is better
    // served a retryable answer than a socket that eventually times out. `0` is
    // allowed and means "never queue": fail as soon as the limit is reached.
    PASSWORD_HASH_WAIT_MS: z.coerce.number().int().nonnegative().default(2000),

    // --- Test-double selection (guarded by the superRefine below) ---
    AUTH_IDENTITY_ADAPTER: z.enum(['github', 'mock']).optional(),
    MAILER_ADAPTER: z.enum(['resend', 'log']).optional(),
    // The integration harness runs the app as a child process, so "this is a test
    // run" has to cross the boundary as configuration. Only the literal `1` counts;
    // anything else (including `0`, `true` and an empty value) reads as "not a test
    // run", which keeps a typo from quietly enabling a fake adapter.
    INTEGRATION_TEST_RUN: z
      .string()
      .optional()
      .transform((value) => value === '1'),

    // --- Mail (declared here, consumed by the notifications slice) ---
    MAIL_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // A test double selected without the integration-run signal is refused at parse
    // time — the app fails at boot rather than falling back to the real adapter.
    // A quiet fallback would leave an operator believing the mock is active when it
    // is not, and the inverse (a mock live in a real deployment) turns sign-in into
    // "sign in as anyone". See "Selecting the identity adapter" in
    // `.ai/specs/2026-09-04-accounts-and-roles.md`.
    if (env.INTEGRATION_TEST_RUN) {
      return;
    }

    if (env.AUTH_IDENTITY_ADAPTER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_IDENTITY_ADAPTER'],
        message:
          'AUTH_IDENTITY_ADAPTER=mock replaces GitHub sign-in with a fake identity that ' +
          'signs in as whoever is asked for. It is only allowed in an integration-test ' +
          'run: set INTEGRATION_TEST_RUN=1 as well, or unset AUTH_IDENTITY_ADAPTER.',
      });
    }

    if (env.MAILER_ADAPTER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAILER_ADAPTER'],
        message:
          'MAILER_ADAPTER=log writes every email to the application log instead of ' +
          'delivering it, so verification links would never reach a real inbox. It is ' +
          'only allowed in an integration-test run: set INTEGRATION_TEST_RUN=1 as well, ' +
          'or unset MAILER_ADAPTER (development picks the log mailer on its own).',
      });
    }
  });

export type AppEnv = z.infer<typeof appEnvSchema>;

let cached: AppEnv | undefined;

/** Parse and cache the validated application environment. */
export function getEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  if (!cached) {
    cached = appEnvSchema.parse(env);
  }
  return cached;
}

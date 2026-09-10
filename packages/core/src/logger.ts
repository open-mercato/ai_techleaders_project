import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { getEnv } from './config/env';

/**
 * Key names whose value is never safe in a log line: the plaintext password a user
 * typed, the scrypt hash of it, any bearer/OAuth/purpose token, and the two request
 * headers that carry credentials.
 *
 * These are *names*, not paths — `REDACT_PATHS` below expands each one to the depths a
 * log call actually reaches.
 */
const SECRET_KEYS = ['password', 'passwordHash', 'token', 'authorization', 'cookie'] as const;

/** What a redacted value is replaced with, so a redacted field is obvious in a log. */
export const REDACT_CENSOR = '[redacted]';

/**
 * pino's `redact` takes **paths**, not a key list: `password` alone matches only a
 * top-level `password` property and would sail straight past `{ err: { password } }`.
 * Each secret key is therefore registered at the three depths log calls in this
 * repository reach:
 *
 * - top level — `logger.warn({ token })`
 * - one below a wildcard — `err.password`, `user.passwordHash`, `headers.cookie`
 * - two below — `req.headers.authorization`, the shape pino's standard request
 *   serializer produces
 *
 * The wildcard is a first segment, so the middle level covers *any* container key
 * (`err`, `user`, `body`, `input`) rather than an enumerated list that the next
 * concept's log call would fall outside of.
 *
 * Redaction is the second line of defence, not the first: `fetchJson`
 * (`http/outbound.ts`) never passes a request body or request headers to a logger at
 * all, and services log ids rather than credentials. This catches the log call that
 * forgets.
 */
export const REDACT_PATHS: readonly string[] = [
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((key) => `*.${key}`),
  ...SECRET_KEYS.map((key) => `*.*.${key}`),
];

/** The pino configuration, split out so a test can assert it and reuse it verbatim. */
export function loggerOptions(): LoggerOptions {
  const env = getEnv();
  return {
    level: env.LOG_LEVEL,
    base: { app: env.APP_NAME },
    redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
  };
}

/**
 * Root application logger. In development we keep raw JSON (no `pino-pretty` dep in
 * the base install); wire up a transport later if desired.
 *
 * `destination` exists for tests, which need somewhere to read the emitted line back
 * from; production calls this with no argument and pino writes to stdout.
 */
export function createLogger(destination?: DestinationStream): Logger {
  return pino(loggerOptions(), destination);
}

export type { Logger };

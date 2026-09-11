import { createLogger, type Logger } from '../logger';
import { ServiceUnavailableError } from './errors';
import { withoutQuery } from './safe-url';

/**
 * The one sanctioned way to call an upstream JSON API (platform primitives B20).
 *
 * Node's `fetch` has **no default timeout**: a hung GitHub or Resend would hang a route
 * handler indefinitely, holding a request-scoped `EntityManager` open with it. Every
 * integration also needs the same failure translation (one retryable 503, never the
 * upstream's own status or body) and the same redaction discipline. Deriving those three
 * per integration is how one of them ends up logging an access token.
 *
 * Call sites today: the GitHub identity adapter (`POST /login/oauth/access_token` with a
 * JSON body, then `GET /user` and `GET /user/emails` with an `authorization` header) and
 * the Resend mailer (`POST /emails`, bearer key, JSON body).
 *
 * **Deviation from B20's sketch, recorded deliberately.** B20 wrote the second parameter
 * as `RequestInit & { timeoutMs?: number }`. This takes a narrow bag instead. `RequestInit`
 * would let a caller pass its own `signal` — silently disabling the timeout that is the
 * whole point — and a pre-serialised `body: string | FormData | ReadableStream`, which
 * makes "never log the body" a promise about a value this module cannot reason about.
 * Neither call site needs anything `RequestInit` adds. The `timeoutMs` key, the default,
 * and the error contract are unchanged.
 */

/** B20's default. Long enough for a slow upstream, short enough that a user still waits. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchJsonOptions = {
  method?: 'GET' | 'POST';
  /** Sent as-is. May carry `authorization`; never logged. */
  headers?: Record<string, string>;
  /** Serialised as JSON, which also sets `content-type`. Never logged. */
  body?: unknown;
  timeoutMs?: number;
};

/**
 * The `cause` of a `ServiceUnavailableError` raised by a non-2xx upstream response. It
 * carries the upstream status for logs and tests; the status deliberately does not reach
 * the client, which sees one 503 whatever the upstream said.
 */
export class OutboundHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(method: string, url: string, status: number) {
    super(`${method} ${url} responded with ${status}`);
    this.name = 'OutboundHttpError';
    this.status = status;
    this.url = url;
  }
}

let cachedLogger: Logger | undefined;
function logger(): Logger {
  return (cachedLogger ??= createLogger());
}

/**
 * Everything that reaches a log line, assembled in one place so the redaction rule is
 * checkable by reading a single function: method, target and — for an HTTP failure — the
 * upstream status. The request body and the request headers are not parameters here, so
 * no caller can add them by accident.
 */
function logFailure(method: string, url: string, reason: string, status?: number): void {
  logger().warn(
    { method, url, reason, ...(status === undefined ? {} : { status }) },
    'outbound request failed',
  );
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { method = 'GET', headers, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  // Some upstreams accept credentials as query parameters, and a URL is the one part of
  // a request this module does log. `withoutQuery` keeps the host, so a failure log still
  // names which integration failed. See `safe-url.ts` for why redaction cannot do this.
  const target = withoutQuery(url);
  const signal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  } catch (cause) {
    // `AbortSignal.timeout` rejects the fetch with its own reason; anything else is DNS,
    // TLS or a dropped connection. Both are "the integration is unavailable".
    const reason = signal.aborted ? `timed out after ${timeoutMs}ms` : 'network failure';
    logFailure(method, target, reason);
    throw new ServiceUnavailableError(undefined, { cause });
  }

  if (!response.ok) {
    const cause = new OutboundHttpError(method, target, response.status);
    // The upstream body is not read, so it can neither be logged nor leak into the
    // envelope the client sees.
    logFailure(method, target, 'upstream error status', response.status);
    throw new ServiceUnavailableError(undefined, { cause });
  }

  try {
    // Unchecked by design: the caller validates the payload it asked for (zod at the
    // adapter). This layer owns transport, not schema.
    return (await response.json()) as T;
  } catch (cause) {
    logFailure(method, target, 'malformed JSON response', response.status);
    throw new ServiceUnavailableError(undefined, { cause });
  }
}

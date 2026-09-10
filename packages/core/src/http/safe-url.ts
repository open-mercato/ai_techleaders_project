/**
 * Removing credentials from a URL before it reaches a log line.
 *
 * pino's `redact` (see `logger.ts`) matches **key names**: `{ token }` is censored, and
 * so is `{ err: { token } }`. A credential that lives inside a URL's *query string* is
 * just a substring of an ordinary `url`/`path` value, so no redaction path can see it
 * and no censor can remove it. Two of this app's own routes carry exactly that shape —
 * `/api/auth/github/callback?code=…&state=…` and `/api/auth/verify-email?token=…` — so
 * the query has to be dropped **at the call site**, before the value is handed to a
 * logger. Redaction cannot be the safety net here.
 *
 * This module is the single place that rule is implemented. It exposes two functions
 * rather than one because the two log sites need different amounts of the URL:
 * `outbound.ts` must keep the upstream's host (a failure log has to say whether GitHub
 * or Resend was unreachable), while `apiHandler.ts` logs a request against this app's
 * own origin, where the path alone identifies the route. One function would fit neither
 * caller; two functions over one shared strip rule fit both.
 */

/**
 * Everything from the first `?` or `#` onwards, removed. Scheme, host and path survive.
 *
 * The fragment goes too: `fetch` never transmits one, so a `#` in a URL that reaches a
 * log is either a mistake or an encoding accident, and neither is worth logging.
 */
export function withoutQuery(url: string): string {
  return url.replace(/[?#][\s\S]*$/, '');
}

/**
 * The path of a request URL and nothing else — no query, no fragment, no origin and no
 * userinfo.
 *
 * **Non-throwing by contract.** This runs inside `apiHandler`'s `catch` block, where a
 * second throw would turn a clean 500 into an unhandled rejection. `Request` guarantees
 * an absolute, parseable `url`, so the fallback is not expected to run against a real
 * request; it exists so that this helper is safe for *any* string a future caller has,
 * and it degrades to the query-stripped input rather than to nothing.
 */
export function requestPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return withoutQuery(url);
  }
}

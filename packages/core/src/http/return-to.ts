/**
 * Open-redirect defence for the `returnTo` round trip (platform primitives B7).
 *
 * Three flows send a signed-out browser through sign-in and must bring it back where it
 * started: an invitation link, the email/password fallback, and the slot picker. Each of
 * them carries a caller-supplied path, so each of them is an open redirect until the
 * value is validated. One validator, every call site.
 *
 * Accepted: a same-origin **relative page path** — a single leading `/`, no scheme, no
 * authority, no control characters, and not under `/api` or `/_next`.
 *
 * The last rule is the one a pure "is it relative?" check misses. A validated
 * `returnTo=/api/auth/github` would drop a freshly signed-in browser back into the OAuth
 * start route, and `returnTo=/api/users` would render a JSON envelope as if it were a
 * page — precisely what the navigated-vs-fetched rule forbids. `/_next/…` is blocked for
 * the same reason: build assets are not pages.
 *
 * **Query and fragment survive.** Validation looks at the path portion only and, when it
 * passes, the candidate is returned byte-for-byte. The flows above need it: the slot
 * picker returns to `/mentors/ada?slot=…` and losing the query would land the user on a
 * page that has forgotten what they were doing. A query string cannot change which route
 * the browser lands on, so it costs nothing to keep. The fragment never reaches the
 * server at all — it is carried by the browser across the redirect.
 */

/** Paths the user must never be *navigated* to, matched on the first path segment. */
const BLOCKED_PREFIXES = ['/api', '/_next'];

/**
 * ASCII control characters. Browsers strip tab, CR and LF from a URL before resolving it,
 * so `"/\t/evil.example"` would become the protocol-relative `//evil.example` after the
 * naive checks below had already passed it. They are also the raw material for response
 * splitting when the value is echoed into a `Location` header. No page path contains one.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // Rejects `''`, `https://evil.example`, `javascript:…`, and bare `evil.example` alike:
  // anything that does not start with a slash can carry its own origin or scheme.
  if (!value.startsWith('/')) return fallback;
  // `//evil.example` is protocol-relative — same origin as us in syntax only.
  if (value.startsWith('//')) return fallback;
  // Browsers normalise `\` to `/` inside the authority, which turns `/\evil.example` into
  // `//evil.example`. Backslashes anywhere are rejected: a page path never needs one.
  if (value.includes('\\')) return fallback;
  if (CONTROL_CHARACTERS.test(value)) return fallback;

  const path = value.replace(/[?#][\s\S]*$/, '');
  // Next matches routes on the decoded pathname, so `/%61pi/users` reaches `/api/users`.
  // Compare what the router will see, not what the query string spelled. Malformed
  // percent-encoding cannot be a path we ever issued, so it falls back rather than
  // guessing.
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return fallback;
  }

  // Case-insensitive as defence in depth: route matching is case-sensitive today, so
  // `/API/users` would 404 rather than leak, but a redirect target is not the place to
  // rely on that.
  const normalised = decoded.toLowerCase();
  for (const prefix of BLOCKED_PREFIXES) {
    if (normalised === prefix || normalised.startsWith(`${prefix}/`)) return fallback;
  }

  return value;
}

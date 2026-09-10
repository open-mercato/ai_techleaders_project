import { ConflictError, createLogger, isAppError } from '@devmentor/core';

/**
 * How a **browser-navigated** auth route answers.
 *
 * `/api/auth/github` and `/api/auth/github/callback` are reached by a top-level
 * navigation, not by `apiCall`, so they catch their own failures and return a redirect:
 * a user who clicked "Sign in with GitHub" must never see `{"ok":false,…}` rendered as a
 * page (API Contracts, edge case 1). `apiHandler` passes a `Response` the route built
 * itself through unchanged, which is what makes that possible without a second wrapper.
 */

/** Where every refusal in the GitHub flow lands. */
const SIGN_IN_PATH = '/sign-in';

/**
 * The `?error=` vocabulary `/sign-in` renders. Four of these are named in the spec's UI/UX
 * section; `email` is added here, and is the code T2.13's sign-in page must also handle.
 *
 * - `state` — the OAuth `state` was missing, did not match the cookie, or did not verify.
 *   A plain "that didn't work, try again": it is usually a stale tab or a slow user, and
 *   there is nothing for them to fix.
 * - `unavailable` — GitHub sign-in is not configured, GitHub is down, slow or refused the
 *   exchange, or something unexpected broke. All retryable, none of them the user's doing.
 * - `verification` — an email-verification link that no longer works (Slice 4's route; it
 *   is listed here so the vocabulary is declared in one place).
 * - `email` — **new.** The sign-in was refused because of an email address, which is the
 *   one refusal in this flow the user can act on and the one that must not surface as a
 *   409 JSON envelope. It covers both `ConflictError`s the flow can raise, because the two
 *   are indistinguishable to a caller and share a remedy: the GitHub account has no
 *   *verified primary* address (edge case 3), or the address matches a DevMentor account
 *   that was never confirmed (edge case 4, unreachable until Slice 4). The page should say
 *   so in both directions — verify a primary address on GitHub, and confirm any DevMentor
 *   registration for it — rather than echoing the service's message, which is server text
 *   and not a query parameter's job to carry.
 */
export type SignInErrorCode = 'state' | 'unavailable' | 'verification' | 'email';

/**
 * A 302 built by hand rather than with `Response.redirect()`, which **cannot carry
 * `Set-Cookie`** — it produces a response whose headers are immutable, so the session
 * cookie would be silently dropped (2026-09-04 lesson). Cookies are `append`ed, not set,
 * because the callback's happy path writes two: the new session and the expiring state.
 */
export function redirectTo(location: string, setCookies: readonly string[] = []): Response {
  const headers = new Headers({ location });
  for (const cookie of setCookies) {
    headers.append('set-cookie', cookie);
  }
  return new Response(null, { status: 302, headers });
}

/** 302 to `/sign-in?error=<code>`. */
export function signInError(
  code: SignInErrorCode,
  setCookies: readonly string[] = [],
): Response {
  return redirectTo(`${SIGN_IN_PATH}?error=${code}`, setCookies);
}

/**
 * 302 to `/sign-in?cancelled=1` — the user pressed "Cancel" on GitHub's authorisation
 * screen. Deliberately not an `?error=`: nothing went wrong and, above all, **no account
 * was created**, which is what the page says (edge case 2).
 */
export function signInCancelled(setCookies: readonly string[] = []): Response {
  return redirectTo(`${SIGN_IN_PATH}?cancelled=1`, setCookies);
}

/**
 * Map a failure anywhere in the OAuth flow onto the vocabulary above.
 *
 * Everything that is not a `ConflictError` collapses to `unavailable`, including errors
 * that are not `AppError`s at all — a database outage during `findOrCreateFromGithub`, say.
 * That is the navigated-route rule taken seriously: `apiHandler` would answer an unexpected
 * failure with a 500 JSON envelope, and a browser would render it as the page. Unexpected
 * failures are logged here instead, exactly as `apiHandler` would have logged them, so
 * nothing is swallowed; expected ones (`ServiceUnavailableError` from a missing credential
 * or a GitHub outage) are already reported by the layer that raised them.
 */
export function signInErrorCodeFor(error: unknown, route: string): SignInErrorCode {
  if (error instanceof ConflictError) {
    return 'email';
  }
  if (!isAppError(error)) {
    createLogger().error({ err: error, route }, 'unhandled failure in the GitHub sign-in flow');
  }
  return 'unavailable';
}

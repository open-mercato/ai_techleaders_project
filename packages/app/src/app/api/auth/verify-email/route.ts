import {
  apiHandler,
  createLogger,
  isAppError,
  safeReturnTo,
  withScope,
  VERIFY_EMAIL_PATH,
} from '@devmentor/core';
import { homeFor } from '../../../../lib/home-for';
import { redirectTo, signInError } from '../../../../lib/sign-in-redirect';

// Verifies a token, writes `email_verified_at` and sets the session cookie.
export const dynamic = 'force-dynamic';

/**
 * `GET /api/auth/verify-email?token=…` — the link in the registration email, and the only
 * thing in the system that turns a registration into an account somebody can sign in as.
 *
 * **Browser-navigated, so no outcome may answer the envelope.** This URL is opened by
 * clicking a link in a mail client, which renders whatever comes back as a page; `{"ok":
 * false,…}` on screen would be the same failure as showing a JSON envelope to someone who
 * clicked "Sign in with GitHub" (API Contracts). Every path below returns a 302, and
 * `apiHandler` passes a `Response` the route built itself through unchanged, which is what
 * makes that possible without a second wrapper. `apiHandler` also exempts `GET` from the
 * CSRF header — a mail client cannot set one, and this request changes state only on the
 * authority of a signed token it carries.
 *
 * **A valid link signs the user in, on the way through.** `Response.redirect()` cannot carry
 * `Set-Cookie` — its headers are immutable, so the cookie would be silently dropped
 * (2026-09-04 lesson) — so `redirectTo` builds `new Response(null, { status: 302, headers })`
 * by hand and appends the cookie to it. That is the whole trick: one response both moves the
 * browser and authenticates it.
 *
 * **Where it lands** is `safeReturnTo(?returnTo, homeFor(roles))`. The parameter was
 * validated once when the link was built, has travelled through a mail relay and an inbox
 * since, and is validated again here — belt and braces, but the fallback is the part that
 * earns its keep: no destination means the role home, decided in the one place that decides
 * it. `//evil.example`, an absolute URL, `/api/…` and `/_next/…` are all rejected (edge case
 * 22), so a link cannot be mailed to somebody that lands them off-site or on a JSON route.
 *
 * **Everything untrustworthy answers `/sign-in?error=verification`** — a bad signature, the
 * wrong audience, an expired token, a malformed one, a missing `?token` and a token naming a
 * user who no longer exists. `EmailVerificationService.verify` collapses them to `null` on
 * purpose: they are indistinguishable to the person holding the link, they share one remedy,
 * and telling them apart would be a probe for which tokens ever existed. Reopening a link
 * for an address that is *already* confirmed is **not** in that set: it is idempotent and
 * still signs the user in (edge case 16), because a mail scanner that prefetched the link
 * must not consume the user's only way into their new account.
 */
export const GET = apiHandler(async (req) => {
  try {
    return await withScope(async ({ emailVerificationService, sessionService }) => {
      const query = new URL(req.url).searchParams;

      const account = await emailVerificationService.verify(query.get('token') ?? '');
      if (account === null) {
        return signInError('verification');
      }

      const { cookie } = await sessionService.issue({
        id: account.userId,
        sessionVersion: account.sessionVersion,
      });
      return redirectTo(safeReturnTo(query.get('returnTo'), homeFor(account.roles)), [cookie]);
    });
  } catch (error) {
    return verificationFailed(error);
  }
});

/**
 * The catch-all, and why it is not `signInErrorCodeFor`.
 *
 * That helper maps the *GitHub* vocabulary: a `ConflictError` means "we could not use the
 * address on that GitHub account" and everything else means "GitHub is unavailable", neither
 * of which is a sentence to show someone who clicked a link in their own registration mail.
 * A failure here — the database down mid-verification, a deployment that has lost its
 * `SESSION_SECRET` between the token check and the cookie — is answered as `verification`,
 * whose copy tells them to open the most recent link for their address or register again.
 * That is the actionable advice in every one of these cases, including the retryable ones.
 *
 * Unexpected failures are logged exactly as `apiHandler` would have logged them, so nothing
 * is swallowed by the redirect that replaces its 500. Expected ones (an `AppError`) were
 * already reported by the layer that raised them. `createLogger` rather than the scope's
 * logger, because the failure may be the container refusing to build at all.
 */
function verificationFailed(error: unknown): Response {
  if (!isAppError(error)) {
    createLogger().error(
      { err: error, route: VERIFY_EMAIL_PATH },
      'unhandled failure while confirming an email address',
    );
  }
  return signInError('verification');
}

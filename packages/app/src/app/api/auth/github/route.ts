import {
  apiHandler,
  getEnv,
  issueOauthStateCookie,
  OAUTH_STATE_TTL_SECONDS,
  safeReturnTo,
  withScope,
} from '@devmentor/core';
import { redirectTo, signInError, signInErrorCodeFor } from '../../../../lib/sign-in-redirect';

/**
 * Start of the GitHub OAuth flow.
 *
 * Three things happen, in this order and no other:
 *
 * 1. `?returnTo` is validated by `safeReturnTo` **here**, at the entrance, and carried
 *    through the round trip as the state token's `sub` rather than as a query parameter
 *    the callback would have to trust. An unacceptable value becomes `''` ("no particular
 *    destination"), which the callback turns into the role home — never a rejection, since
 *    the user asked to sign in and the destination is a detail (edge case 22).
 * 2. The state token is minted and pinned to this browser with `devmentor_oauth_state`.
 *    Both halves matter and neither is sufficient alone: the signature proves *we* issued
 *    the claim, the cookie proves *this browser* is who we issued it to.
 * 3. The browser is redirected to whatever `authorizeUrl` returns. Which adapter answers —
 *    github.com or the harness mock — is a container decision this route cannot see, and
 *    that is the point: an env-keyed test branch inside an auth route would be an
 *    authentication bypass living in production code.
 *
 * Browser-navigated, so every failure is a redirect. The only one reachable in practice is
 * an unconfigured deployment: `authorizeUrl` throws `ServiceUnavailableError` when
 * `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are unset, and `signPurposeToken` throws the
 * same when `SESSION_SECRET` is. Both become `/sign-in?error=unavailable`, and the rest of
 * the app keeps building, booting and serving public pages (edge case 1, B6).
 */

// Mints a signed token, sets a cookie and reads the query string — nothing about this
// response is the same twice, and none of it may be prerendered.
export const dynamic = 'force-dynamic';

/**
 * GitHub's own account-hint parameter, validated against GitHub's own rule for a username:
 * 1–39 characters of ASCII letters, digits and hyphens.
 *
 * It is validated because it is echoed into a URL we build, and dropped rather than
 * refused because it is a *hint*: a malformed one costs the user nothing but an extra
 * click on GitHub's account picker, whereas refusing the sign-in would be a dead end over
 * a cosmetic parameter. The identity that comes back is whoever actually authorised, never
 * whoever was hinted — nothing downstream trusts this value.
 */
const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/;

function loginHint(value: string | null): string | undefined {
  return value !== null && GITHUB_LOGIN.test(value) ? value : undefined;
}

export const GET = apiHandler(async (req) => {
  const query = new URL(req.url).searchParams;
  const returnTo = safeReturnTo(query.get('returnTo'), '');
  const login = loginHint(query.get('login'));

  try {
    return await withScope(async ({ githubIdentity, tokenService }) => {
      const state = await tokenService.signPurposeToken({
        purpose: 'oauth-state',
        subject: returnTo,
        ttlSeconds: OAUTH_STATE_TTL_SECONDS,
      });

      // Cookie strings are built from `getEnv()` rather than the container's `env`, in
      // both halves of this flow: the callback has to be able to expire the state cookie
      // on a path where the container itself is what failed, and one rule for both routes
      // is easier to keep than two.
      return redirectTo(githubIdentity.authorizeUrl({ state, login }), [
        issueOauthStateCookie(state, getEnv()),
      ]);
    });
  } catch (error) {
    return signInError(signInErrorCodeFor(error, '/api/auth/github'));
  }
});

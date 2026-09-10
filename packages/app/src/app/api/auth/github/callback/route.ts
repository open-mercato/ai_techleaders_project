import {
  apiHandler,
  clearOauthStateCookie,
  getEnv,
  readOauthStateCookie,
  safeReturnTo,
  withScope,
  GITHUB_CALLBACK_PATH,
  type Cradle,
} from '@devmentor/core';
import { homeFor } from '../../../../../lib/session';
import {
  redirectTo,
  signInCancelled,
  signInError,
  signInErrorCodeFor,
} from '../../../../../lib/sign-in-redirect';

// Reads a cookie, verifies a token, writes to the database and sets a cookie.
export const dynamic = 'force-dynamic';

/**
 * The GitHub OAuth callback — where a sign-in actually happens.
 *
 * **The order of the first three checks is the security of the whole flow**, and each is
 * cheaper than the one after it:
 *
 * 1. `?error` — GitHub itself refused. `access_denied` is the user pressing Cancel and is
 *    not an error at all; the page says so, and says that no account was created, because
 *    none was (edge case 2). Any other provider code is a misconfiguration or an outage on
 *    their side, which is `unavailable`.
 * 2. `?state` **equals the `devmentor_oauth_state` cookie**. This comparison, and not the
 *    signature, is what stops login CSRF: a purpose token proves we issued the claim, not
 *    that this browser is the one we issued it to, so an attacker who starts a flow of
 *    their own holds a perfectly valid `state`. Feeding it to a victim together with the
 *    attacker's `?code` would sign the victim into the *attacker's* account — unless the
 *    value must also arrive in a cookie only the victim's browser could have been given.
 * 3. Only then the signature and expiry. Both refusals answer `?error=state`, and both
 *    happen **before any outbound call**, so a forged callback costs GitHub nothing and
 *    costs us one token verification (edge case 6).
 *
 * Every outcome expires the state cookie. A state is single-use: leaving it in the browser
 * would keep the pair matching for the rest of its ten minutes.
 *
 * Browser-navigated, so nothing here may answer with the JSON envelope. GitHub being slow,
 * down or unconfigured (edge cases 1, 7, 8) all surface as `ServiceUnavailableError` and
 * land on `?error=unavailable`; the two refusals about an email address land on
 * `?error=email`; anything unexpected is logged and treated as `unavailable`.
 */
export const GET = apiHandler(async (req) => {
  const clearState = [clearOauthStateCookie(getEnv())];

  try {
    return await withScope((cradle) => completeSignIn(req, cradle, clearState));
  } catch (error) {
    return signInError(signInErrorCodeFor(error, GITHUB_CALLBACK_PATH), clearState);
  }
});

async function completeSignIn(
  req: Request,
  { githubIdentity, sessionService, tokenService, userService }: Cradle,
  clearState: readonly string[],
): Promise<Response> {
  const query = new URL(req.url).searchParams;

  const refusal = query.get('error');
  if (refusal !== null) {
    return refusal === 'access_denied'
      ? signInCancelled(clearState)
      : signInError('unavailable', clearState);
  }

  const state = query.get('state');
  const bound = readOauthStateCookie(req);
  // Equality first. A missing cookie is the ordinary shape of this failure — a stale tab,
  // a browser that dropped it, or a callback nobody in this browser ever started.
  if (state === null || bound === null || state !== bound) {
    return signInError('state', clearState);
  }

  // Then the signature, the audience and the expiry, in `TokenService`. `null` covers all
  // three, plus a value we never minted.
  const claims = await tokenService.verifyPurposeToken({
    token: state,
    purpose: 'oauth-state',
  });
  if (claims === null) {
    return signInError('state', clearState);
  }

  const code = query.get('code');
  if (code === null) {
    // State checked out but GitHub sent no code: our flow, their problem. Retryable, so
    // `unavailable` rather than `state`, which would tell the user to distrust their own
    // browser over something that happened at the provider.
    return signInError('unavailable', clearState);
  }

  const identity = await githubIdentity.fetchIdentity(await githubIdentity.exchangeCode(code));
  const { user, sessionVersion } = await userService.findOrCreateFromGithub(identity);
  const { cookie } = await sessionService.issue({ id: user.id, sessionVersion });

  // `safeReturnTo` runs a second time on the way out. The subject was validated at the
  // start route and has been signed ever since, so this is belt and braces — but the
  // fallback is the part that earns its keep: an empty subject means "no particular
  // destination", which is the role home, decided in the one place that decides it.
  return redirectTo(safeReturnTo(claims.subject, homeFor(user.roles)), [
    cookie,
    ...clearState,
  ]);
}

import { readCookie, serializeCookie, type CookieEnv } from '../../http/cookies';

/**
 * The `devmentor_oauth_state` cookie: the browser-bound half of the OAuth state check.
 *
 * **Why a cookie at all, when the state is already a signed token.** A purpose token
 * (B5) proves *we issued this claim*, not *this browser is the one we issued it to* — an
 * attacker can start a flow of their own, keep the `state` value, and feed it to a
 * victim's browser together with their own `?code`. The victim would then be signed into
 * the *attacker's* account and everything they did next would be visible to the attacker.
 * What stops that is the pairing: the same value must arrive both in the query string and
 * in a cookie only this browser holds, and the callback compares the two **for equality
 * before it verifies anything**, so a forged callback is refused without a single outbound
 * request to GitHub.
 *
 * Cookie strings are hand-rolled in `core` (no `cookie` package) and share one serializer
 * with the session cookie — see `http/cookies.ts` for the `SameSite=Lax` rule, which is
 * load-bearing here: the callback is a cross-site top-level navigation from github.com, so
 * a `Strict` cookie would not be sent and every sign-in would fail (2026-09-04 lesson).
 */

/**
 * A §7 protected surface only in the weak sense: renaming it while a sign-in is in flight
 * fails that sign-in with `?error=state`, and the user simply starts again.
 */
export const OAUTH_STATE_COOKIE_NAME = 'devmentor_oauth_state';

/**
 * Ten minutes — the cookie's `Max-Age` and the state token's `exp`, deliberately the same
 * number so the two halves of the pair die together. Long enough to authorise on GitHub
 * including a fresh sign-in and a 2FA prompt there; short enough that an abandoned tab
 * does not leave a usable state lying around for the rest of the day.
 */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** The `Set-Cookie` value that binds a freshly minted state token to this browser. */
export function issueOauthStateCookie(state: string, env: CookieEnv): string {
  return serializeCookie({
    name: OAUTH_STATE_COOKIE_NAME,
    value: state,
    maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
    env,
  });
}

/**
 * The `Set-Cookie` value that removes it, sent on **every** callback outcome.
 *
 * A state is single-use: once the callback has read it, leaving it in the browser would
 * let the same `?state` be presented again for the rest of its ten minutes. GitHub's
 * `?code` is single-use too, so a replay would fail at the exchange — but the cheaper and
 * more obvious guarantee is that the pair only ever matches once.
 */
export function clearOauthStateCookie(env: CookieEnv): string {
  return serializeCookie({
    name: OAUTH_STATE_COOKIE_NAME,
    value: '',
    maxAgeSeconds: 0,
    env,
  });
}

/**
 * The raw state cookie off a callback request, or `null`. Unverified by construction —
 * the callback compares it with `?state` for equality and only then asks `TokenService`
 * whether the value is one of ours.
 */
export function readOauthStateCookie(req: Request): string | null {
  return readCookie(req, OAUTH_STATE_COOKIE_NAME);
}

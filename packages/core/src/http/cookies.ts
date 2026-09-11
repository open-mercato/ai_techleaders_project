import type { AppEnv } from '../config/env';

/**
 * The hand-rolled `Set-Cookie` writer and `Cookie` reader — platform primitives **B2**'s
 * "20 lines of local code" case, so no `cookie` package.
 *
 * It lives here, rather than privately inside `SessionService`, because E01 sets **two**
 * cookies with the same five attributes: the session (B2) and the OAuth `state` (the
 * GitHub flow in `.ai/specs/2026-09-04-accounts-and-roles.md`). Two hand-written copies of
 * the same attribute list is exactly the drift that produces a `SameSite=Strict` state
 * cookie and a sign-in that fails on every attempt (2026-09-04 lesson). One serializer,
 * one place the `Secure`-in-production rule is decided, one place to change if the policy
 * ever moves.
 *
 * Nothing here is auth: a cookie string is a header value, and the trust decision about
 * what is inside it belongs to `SessionService.verify` / `TokenService.verifyPurposeToken`.
 */

/** What the serializer needs from the environment, and deliberately nothing else. */
export type CookieEnv = Pick<AppEnv, 'NODE_ENV'>;

export interface SerializeCookieInput {
  /** The cookie's name. Never encoded — every name this codebase writes is a bare token. */
  name: string;
  /**
   * The value, written verbatim. We never percent-encode, because every value we set is a
   * compact JWT (base64url and dots, all cookie-safe) or the empty string used to delete.
   */
  value: string;
  /**
   * `Max-Age` rather than `Expires`: it is relative, so a client whose clock is days out
   * still drops the cookie on time. `0` is the "delete now" value in every browser we
   * target.
   */
  maxAgeSeconds: number;
  env: CookieEnv;
}

/**
 * A complete `Set-Cookie` header value.
 *
 * `Secure` is set only in production. `npm run dev` serves plain HTTP on localhost, so an
 * unconditional `Secure` would make sign-in impossible locally. The integration harness
 * runs as production over plain-HTTP loopback and still works, because Chrome treats
 * loopback origins as trustworthy — browser behaviour, not something implemented here.
 *
 * `SameSite=Lax`, never `Strict`, for both cookies this writes. The OAuth callback and the
 * post-sign-in landing are top-level navigations that arrive cross-site from github.com,
 * and a `Strict` cookie is not sent on those: the state cookie would be missing on every
 * callback and every sign-in would fail with `?error=state` (2026-09-04 lesson).
 *
 * The `__Host-` prefix, which would let the browser enforce `Secure` + `Path=/` + no
 * `Domain`, was weighed and rejected in B2: it forbids `Secure`-less cookies outright,
 * which is the local-development case above.
 */
export function serializeCookie({
  name,
  value,
  maxAgeSeconds,
  env,
}: SerializeCookieInput): string {
  const attributes = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    // Unreadable to `document.cookie`, so an XSS bug cannot exfiltrate a session or a
    // state token.
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

/**
 * Pull one cookie out of a request's `Cookie` header, or `null`.
 *
 * This is header parsing, not authorization: it returns an unverified string that only a
 * verifier can make a claim about.
 *
 * Values are returned exactly as they arrived, with no percent-decoding: we never encode
 * on write, so decoding could only ever corrupt a value or throw `URIError` on a hostile
 * `%zz` — a 500 handed to anyone who could set a cookie.
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) {
    return null;
  }

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) {
      // A bare attribute with no `=`. Not a cookie; skip it rather than reading the whole
      // segment as a name.
      continue;
    }
    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }

  return null;
}

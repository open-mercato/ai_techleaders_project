import { SignJWT, jwtVerify } from 'jose';
import type { AppEnv } from '../../config/env';
import type { Clock } from '../../time/clock';
import { readCookie, serializeCookie } from '../../http/cookies';
import { signingKey, verificationKeys } from './session-secret';

/**
 * The session mechanism — platform primitives **B2**.
 *
 * A session is a compact HS256 JWT in a cookie, signed with the `SESSION_SECRET` family.
 * There is no session store: the cookie *is* the session, and `verify` is pure, DB-free
 * and synchronous in everything but its use of WebCrypto.
 *
 * **Why stateless plus a version column, rather than a session table.** A purely
 * stateless token cannot be revoked — a copied cookie would stay valid for its full 24
 * hours regardless of sign-out, and an operator demotion would take up to a day to
 * bite. A session table would fix that and cost a row write per sign-in plus a lookup
 * per request. B2 takes the third option: `users.session_version` is mirrored into the
 * token as `sv`, and the guard compares the two. Bumping the column invalidates every
 * outstanding session for that user at once, which covers sign-out-everywhere,
 * demotion and password change with one integer — and the comparison rides along on a
 * lookup the guard already performs, since it must load the user's roles anyway. The
 * cost is therefore *one indexed primary-key lookup* per guarded request, not a second
 * table. That lookup and the comparison belong to `requireSession` (B3); this service
 * only puts `sv` in the token and hands it back.
 *
 * **No roles in the token.** The claims identify a user and nothing more. Authorization
 * always loads the current stored set, because `operator` authority is derived live from
 * `OPERATOR_EMAILS` on every request — a copy in the token would be a second source of
 * truth that a demotion could not reach until the cookie expired.
 *
 * **Audience separation.** Every token this codebase signs carries an `aud` and every
 * verifier names the one it accepts. This one is `aud: 'session'`, so a purpose token
 * (B5: `oauth-state`, `email-verify`) presented as a session cookie is unreadable here,
 * and a session cookie replayed as a verification link is unreadable there —
 * structurally, not because one happens to lack a claim the other checks.
 *
 * **Key rotation.** `SESSION_SECRET_PREVIOUS` is accepted on verify and never used to
 * sign, so rotating a secret does not sign every user out at once. See
 * `session-secret.ts`.
 */

/**
 * The cookie name, exported because two callers outside this module need it: the App
 * Router page helper (F3) reads `cookies().get(SESSION_COOKIE_NAME)`, and the
 * integration harness asserts the cookie was stored. It is a §7 protected surface —
 * renaming it signs every live user out.
 */
export const SESSION_COOKIE_NAME = 'devmentor_session';

/**
 * 24 hours. Long enough that a mentee arranging a session over an evening is never
 * interrupted mid-flow, short enough that a cookie stolen from a shared machine stops
 * working within a day even if nobody signs out. There is no refresh flow — a refresh
 * would either extend that stolen window indefinitely or need a second token type — so
 * this number is the whole lifetime policy.
 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** The one audience this service issues and the only one it accepts. */
const SESSION_AUDIENCE = 'session';

/** `HS256` and nothing else — see the note on the allowlist in `verify`. */
const ALGORITHM = 'HS256';

/** Names the capability that is down, never the value that is missing. */
const SECRET_UNAVAILABLE =
  'Sessions are unavailable because SESSION_SECRET is not configured.';

/** What `issue` needs from a user row, and deliberately nothing else. */
export interface SessionUser {
  id: string;
  sessionVersion: number;
}

/** The trustworthy content of a session cookie. Identity and version — no roles. */
export interface SessionClaims {
  /** The `sub` claim: the user's id. */
  userId: string;
  /** The `sv` claim, to be compared against the stored column by the guard. */
  sessionVersion: number;
}

export interface IssuedSession {
  /** A complete `Set-Cookie` header value. */
  cookie: string;
  /**
   * When the token stops verifying, which is also when the browser is told to drop the
   * cookie. Returned so a caller can report or log the boundary without re-deriving it.
   */
  expiresAt: Date;
}

export class SessionService {
  private readonly env: AppEnv;
  private readonly clock: Clock;

  constructor({ env, clock }: { env: AppEnv; clock: Clock }) {
    this.env = env;
    this.clock = clock;
  }

  /**
   * Sign a session token and wrap it in a `Set-Cookie` value.
   *
   * Async because `jose` signs through WebCrypto, which has no synchronous path; B2
   * sketched a synchronous return before that constraint was known.
   */
  async issue(user: SessionUser): Promise<IssuedSession> {
    // `iat`/`exp` come from the injected clock, never `Date.now()` — that is what makes
    // the expiry boundary testable without sleeping.
    const issuedAt = this.clock.now();
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_SECONDS * 1000);

    const token = await new SignJWT({ sv: user.sessionVersion })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(user.id)
      .setAudience(SESSION_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(signingKey(this.env, SECRET_UNAVAILABLE));

    return {
      cookie: this.serializeCookie(token, SESSION_TTL_SECONDS),
      expiresAt,
    };
  }

  /**
   * Verify a cookie value and return its claims, or `null` for anything untrustworthy —
   * bad signature, wrong audience, expired, malformed, or signed with a secret we do not
   * know. Only *our* misconfiguration throws (`ServiceUnavailableError`).
   *
   * That split is what the call sites need. A tampered or expired cookie is a normal
   * event — the browser is redirected to `/sign-in` and nothing of the user's is
   * rendered first (edge case 10) — so it must not arrive as an exception that every
   * layout would have to catch. A missing `SESSION_SECRET` is the opposite kind of
   * failure: not a claim about the cookie, but a deployment that cannot authenticate
   * anyone.
   *
   * This does **not** check `session_version` against the database; it cannot, it has no
   * `EntityManager`. `requireSession` (B3) owns that comparison, and it is what makes a
   * copied cookie stop working at sign-out (edge case 11).
   */
  async verify(cookieValue: string): Promise<SessionClaims | null> {
    for (const key of verificationKeys(this.env, SECRET_UNAVAILABLE)) {
      try {
        const { payload } = await jwtVerify(cookieValue, key, {
          // The allowlist is not a formality. Without it the token's own `alg` header
          // chooses the verification algorithm, which is the classic JWT break: `alg:
          // none` asks for no signature at all, and an asymmetric `alg` invites
          // algorithm confusion. Pinning the one algorithm we sign with means the
          // header can never influence the decision.
          algorithms: [ALGORITHM],
          // Enforced by `jose`, not by us reading `payload.aud` afterwards, so it
          // cannot be forgotten. This is the line that stops a purpose token from being
          // presented as a session.
          audience: SESSION_AUDIENCE,
          // `exp` is compared against the injected clock, not the host's wall clock.
          currentDate: this.clock.now(),
        });

        // Both claims are optional in the JWT spec, so a token can verify while
        // carrying neither. We signed it, but it is not one of ours — and returning
        // here rather than continuing the loop is deliberate: the signature already
        // matched, so another key cannot produce a better answer.
        if (typeof payload.sub !== 'string' || payload.sub === '') {
          // Unlike a purpose token, whose subject may legitimately be `''` ("no
          // particular destination"), a session with no user is meaningless.
          return null;
        }
        if (typeof payload.sv !== 'number' || !Number.isInteger(payload.sv)) {
          // `sv` is compared for equality against an integer column. Anything else —
          // absent, a string, a float — cannot be that value, and letting it through
          // would move the type check into every guard. No range check beyond this:
          // a session version we never issued simply fails the live comparison.
          return null;
        }

        return { userId: payload.sub, sessionVersion: payload.sv };
      } catch {
        // Fail closed and stay quiet: nothing here is logged, because the only things
        // in scope are the cookie and the key material. Try the previous secret, and if
        // that was the last one, the loop ends and the cookie is rejected.
      }
    }

    return null;
  }

  /**
   * The `Set-Cookie` value that removes the session cookie.
   *
   * **It requires nothing** — not a valid session, not even a configured
   * `SESSION_SECRET`. Sign-out must always succeed: signing out with an expired or
   * tampered cookie clears it and returns `{ ok: true }` (edge case 27), because the
   * alternative is a user who cannot get rid of a cookie they no longer trust. The
   * `session_version` bump that ends the user's *other* sessions happens in the route
   * only when a live session was actually presented; there is nothing to bump otherwise.
   */
  clear(): string {
    return this.serializeCookie('', 0);
  }

  /**
   * Pull the raw session cookie out of a request's `Cookie` header, or `null`.
   *
   * This is header parsing, not authorization: it returns an unverified string that only
   * `verify` can make a claim about. It exists so the route-facing guard can start from a
   * `Request` while the page helper starts from `cookies()` — both then call `verify` on
   * a raw value, and neither has to know the cookie's name or hand-roll this loop.
   *
   * Values are returned exactly as they arrived, with no percent-decoding: we never
   * encode on write (a JWT is base64url and dots, all cookie-safe), so decoding could
   * only ever corrupt a value or throw `URIError` on a hostile `%zz` — a 500 handed to
   * anyone who could set a cookie.
   */
  readCookie(req: Request): string | null {
    return readCookie(req, SESSION_COOKIE_NAME);
  }

  /**
   * The `Set-Cookie` value for this service's one cookie.
   *
   * The attribute list itself lives in `http/cookies.ts`, shared with the OAuth `state`
   * cookie, so the `SameSite=Lax` and `Secure`-in-production rules are decided once. What
   * stays here is the only part that is this service's decision: the name, and matching
   * `Max-Age` to the token's lifetime so the browser's copy dies exactly when the
   * signature stops verifying, instead of a long-lived browser session replaying a token
   * that expired yesterday.
   */
  private serializeCookie(value: string, maxAgeSeconds: number): string {
    return serializeCookie({
      name: SESSION_COOKIE_NAME,
      value,
      maxAgeSeconds,
      env: this.env,
    });
  }
}

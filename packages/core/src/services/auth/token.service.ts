import { SignJWT, jwtVerify } from 'jose';
import type { AppEnv } from '../../config/env';
import type { Clock } from '../../time/clock';
import { signingKey, verificationKeys } from './session-secret';

/**
 * Purpose-bound, stateless tokens — platform primitives **B5**.
 *
 * A purpose token is a compact HS256 JWT that carries a single claim we made
 * ("the browser that started this OAuth flow asked to return to `/mentors/ada`",
 * "the owner of this mailbox is user X"), signed with the `SESSION_SECRET` family and
 * valid for a bounded window. Nothing is stored: the token *is* the record. The
 * revocable, single-use half of B5 (`mintOpaqueToken` / `hashToken`) is deliberately
 * deferred to its first real consumer, invitation links (#15) — E01 needs the
 * stateless pair only, and an unused hash-and-store API would be dead code that still
 * had to be maintained and covered.
 *
 * **Audience separation is the whole point.** Every token this codebase signs carries
 * an `aud`, and every verifier names the one audience it accepts (B2). A verification
 * link therefore cannot be replayed as an OAuth `state`, nor either of them as a
 * session cookie — structurally, not because one happens to lack a claim the other
 * checks.
 *
 * **A purpose token never authenticates the bearer.** It proves *we issued this
 * claim*, not *this browser is the one we issued it to*. The OAuth callback pairs the
 * `?state` value with the `devmentor_oauth_state` cookie and compares them for
 * equality *before* verifying either; that comparison, not this service, is what stops
 * login CSRF.
 *
 * **Key rotation.** `SESSION_SECRET_PREVIOUS` is accepted on verify and never used to
 * sign, so rotating the secret does not invalidate every verification email already
 * sitting in an inbox. Both secrets are HS256 at the same trust level, which is why
 * purpose tokens share the session family rather than owning a third secret with its
 * own rotation procedure.
 */

/**
 * The audience vocabulary. Every purpose that will ever be signed is named here, in
 * one greppable place, so that "is this audience already taken?" is a question with an
 * answer rather than a search through call sites.
 *
 * `'email-verify'` is declared now even though its route lands in Slice 4. Two
 * reasons: a single-member union is not really a vocabulary — the type would have to
 * be widened by the next feature rather than merely extended — and, more concretely,
 * the audience-mismatch rejection this service exists to guarantee cannot be
 * *type-safely tested* without a second member. Reaching for a cast in that test would
 * be testing a hole in the type, not the behaviour.
 */
export type TokenPurpose = 'oauth-state' | 'email-verify';

export interface SignPurposeTokenInput {
  /** Becomes the `aud` claim, and the only audience `verifyPurposeToken` will accept. */
  purpose: TokenPurpose;
  /**
   * Becomes the `sub` claim. May be the empty string: the OAuth start route signs
   * `safeReturnTo(req.query.returnTo, '')`, whose fallback is `''` ("no particular
   * destination"), and that must survive the round trip as a subject rather than being
   * mistaken for "no subject".
   */
  subject: string;
  /** Lifetime in seconds from the injected clock's "now"; sets `exp`. */
  ttlSeconds: number;
}

export interface VerifyPurposeTokenInput {
  /** The compact JWT exactly as it came off a query string or a cookie. */
  token: string;
  /** The one audience accepted for this call site. Anything else is rejected. */
  purpose: TokenPurpose;
}

export interface PurposeTokenClaims {
  /** The `sub` claim of a token that verified. */
  subject: string;
}

/** `HS256` and nothing else — see the note on the allowlist in `verifyPurposeToken`. */
const ALGORITHM = 'HS256';

/**
 * Said when the secret is missing. Deliberately says nothing about the value — only
 * that it is unset — and names the capability that is down, because the same secret
 * failing during sign-in produces a different sentence (see `session.service.ts`).
 */
const SECRET_UNAVAILABLE =
  'Signed links are unavailable because SESSION_SECRET is not configured.';

export class TokenService {
  private readonly env: AppEnv;
  private readonly clock: Clock;

  constructor({ env, clock }: { env: AppEnv; clock: Clock }) {
    this.env = env;
    this.clock = clock;
  }

  /**
   * Sign a purpose token. Async because `jose` signs through WebCrypto, which has no
   * synchronous path; B5 sketched a `string` return before that constraint was known.
   */
  async signPurposeToken({
    purpose,
    subject,
    ttlSeconds,
  }: SignPurposeTokenInput): Promise<string> {
    // `iat`/`exp` come from the injected clock, never `Date.now()` — that is what makes
    // the expiry boundary testable without sleeping, and what keeps a fake clock in a
    // test honest end to end.
    const issuedAt = this.clock.now();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    return new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(subject)
      .setAudience(purpose)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(signingKey(this.env, SECRET_UNAVAILABLE));
  }

  /**
   * Verify a purpose token against exactly one audience.
   *
   * Returns `null` for every untrustworthy token — bad signature, wrong audience,
   * expired, malformed, or signed with a secret we do not know — and throws only when
   * *we* are misconfigured. That split is what the call sites need: both consumers are
   * browser-navigated routes that must answer a bad token with a redirect
   * (`/sign-in?error=state`, `/sign-in?error=verification`), so a thrown error would
   * force a bare `try`/`catch` into every route — the shape `AGENTS.md` forbids — and
   * a leaked one would render a JSON error envelope into a browser window. A missing
   * `SESSION_SECRET` is the opposite kind of failure: not a claim about the token, but
   * a deployment that cannot answer at all, so it stays a `ServiceUnavailableError`
   * (503, `?error=unavailable`). This mirrors `SessionService.verify` (B2), which
   * likewise returns `null` rather than throwing on a bad cookie.
   */
  async verifyPurposeToken({
    token,
    purpose,
  }: VerifyPurposeTokenInput): Promise<PurposeTokenClaims | null> {
    for (const key of verificationKeys(this.env, SECRET_UNAVAILABLE)) {
      try {
        const { payload } = await jwtVerify(token, key, {
          // The allowlist is not a formality. Without it the token's own `alg` header
          // chooses the verification algorithm, which is the classic JWT break: `alg:
          // none` asks for no signature at all, and an asymmetric `alg` invites
          // algorithm confusion. `jose` refuses `none` outright, but pinning the one
          // algorithm we sign with means the header can never influence the decision.
          algorithms: [ALGORITHM],
          // The audience check — enforced by `jose`, not by us reading `payload.aud`
          // afterwards, so it cannot be forgotten at a call site.
          audience: purpose,
          // `exp` is compared against the injected clock, not the host's wall clock.
          currentDate: this.clock.now(),
        });

        // `sub` is optional in the JWT spec, so a token could verify while carrying no
        // subject (or a non-string one). We signed it, but it is not one of ours.
        // Note the `typeof` test: `''` is a legitimate subject and must not fail here.
        if (typeof payload.sub !== 'string') {
          return null;
        }

        return { subject: payload.sub };
      } catch {
        // Fail closed and stay quiet: nothing here is logged, because the only things
        // in scope are the token and the key material. Try the previous secret, and if
        // that was the last one, the loop ends and the token is rejected.
      }
    }

    return null;
  }
}

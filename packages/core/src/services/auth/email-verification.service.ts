import { User, type EntityManager, type Role } from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import type { Clock } from '../../time/clock';
import { safeReturnTo } from '../../http/return-to';
import type { Mailer } from '../notifications/mailer.port';
import { normalizeRoles } from './operator-authority';
import type { TokenService } from './token.service';

/**
 * Email verification — the second half of password registration (Slice 4, step 25).
 *
 * Registration writes a row and a `password_hash`; **this service is what turns that row
 * into an account somebody can sign in as.** `email_verified_at` is the column that gates
 * sign-in (edge case 15), so until a link from this service is opened, a registration has
 * granted nothing at all — which is precisely what makes it safe for `registerWithPassword`
 * to overwrite an unverified row's hash rather than hold a pending credential somewhere.
 *
 * **The token carries no credential material, and that is a hard rule rather than an
 * accident of the current fields.** `signPurposeToken` produces a signed but *unencrypted*
 * JWT: anybody holding the link can base64-decode its payload, and the link travels in a
 * URL, through a mail relay, into an inbox that is synced, backed up, indexed and
 * occasionally shared. The spec considered putting a pending password hash in the subject
 * and rejected it for exactly this reason ("`registerWithPassword` — the full state
 * matrix"). The subject is the user's id and nothing else; `email-verification.service.test.ts`
 * decodes a real token and asserts the whole claim set, so a later change that stuffs an
 * address, a hash or a role into it fails a test rather than shipping.
 *
 * **Audience separation** does the rest: the token is signed `aud: 'email-verify'`, so a
 * session cookie cannot be replayed as a verification link and a verification link cannot
 * be presented as a session cookie (B2/B5).
 *
 * **This service never builds a response and never sets a cookie.** Only a route handler
 * can set a cookie in the App Router (2026-09-08 lesson), so `verify` returns the material
 * the route needs and the route signs the cookie — the same division `UserService`'s
 * `SignedInUser` documents.
 */

/**
 * Where the link lands. Named here because this module *builds* the URL while
 * `@devmentor/app` *implements* the route, and a hand-copied string in either place would
 * mail out links to a 404. Same reason `GITHUB_CALLBACK_PATH` is a constant.
 */
export const VERIFY_EMAIL_PATH = '/api/auth/verify-email';

/**
 * 24 hours.
 *
 * The number matches `SESSION_TTL_SECONDS`, and the reasoning deliberately does not: a
 * verification link is not a session, so this constant is its own and the two move
 * independently.
 *
 * The upper bound is what this link *is*: a bearer credential that ends in a signed-in
 * browser, sitting in an inbox for as long as it is valid. It must therefore never be more
 * powerful than the session it grants — 24 hours caps the damage of a leaked link at
 * exactly the window D19 already accepted for a leaked cookie, and anything longer would
 * make the inbox copy outlive the thing it produces.
 *
 * The lower bound is the recovery path. E01 ships no resend route, so an expired link is
 * recovered by registering the same address again: the state matrix treats an unverified
 * row as claimable and sends a fresh link. That works, but it re-runs a deliberately
 * expensive hash and is rate-limited at 5 registrations per IP per hour, so an aggressive
 * expiry would turn "signed up on a phone at night, opened the mail on a laptop in the
 * morning" into a failed sign-up. A window that spans one sleep is the point.
 */
const VERIFICATION_TTL_SECONDS = 24 * 60 * 60;

const MAIL_SUBJECT = 'Confirm your email address for DevMentor';

/** What a route needs in order to finish the sign-in this link authorised. */
export interface VerifiedAccount {
  /** The confirmed account. */
  userId: string;
  /**
   * The stored role set, canonical (ordered by `ROLES`, duplicate-free), for the route to
   * pick a landing page with `homeFor`.
   *
   * **Stored, not live-derived.** `resolveLiveRoles` is deliberately not called here: it
   * would need this module to repeat the empty-role-set corruption check that `http/auth.ts`
   * and `UserService` already carry a copy of each, and it would buy one thing only — an
   * allowlisted founder who registered with a password landing on `/admin` instead of
   * `/home` on the single request that confirms their address. Authority is unaffected,
   * because `requireSession` derives `operator` live on that user's very next request
   * (D19, edge case 25), and the nav they land on is built from that live set. A landing
   * page is a convenience; it is not a permission.
   */
  roles: readonly Role[];
  /**
   * The value the route must sign the fresh session cookie from.
   *
   * It rides alongside rather than inside a DTO for the reason `SignedInUser` states:
   * `session_version` is server-only state that must never be serialized to a client, yet
   * the caller needs it in the same request. Verification does **not** bump it — the closed
   * list of triggers is sign-out and role changes, and bumping here would sign the user out
   * of the session this very request is about to issue.
   */
  sessionVersion: number;
}

/** Everything `sendVerificationLink` needs about the account it is writing to. */
export interface VerificationRecipient {
  /** Becomes the token's subject, and the only thing the token says. */
  id: string;
  /** The address being proven, which is also where the proof is sent. */
  email: string;
}

export interface SendVerificationLinkInput {
  user: VerificationRecipient;
  /**
   * Where to send the browser once the link is opened, as supplied at registration.
   * Re-validated by `safeReturnTo` here *and* at the route; anything it rejects becomes the
   * role home. Carried as an ordinary query parameter rather than in the token, because the
   * subject says who the user is and nothing else — and an unsigned `returnTo` grants
   * nothing, since `safeReturnTo` refuses every off-site and non-page destination and the
   * token is what authorises the sign-in.
   */
  returnTo?: string | null;
}

export class EmailVerificationService {
  private readonly em: EntityManager;
  private readonly env: AppEnv;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly mailer: Mailer;
  private readonly tokenService: TokenService;

  constructor({
    em,
    env,
    clock,
    logger,
    mailer,
    tokenService,
  }: {
    em: EntityManager;
    env: AppEnv;
    clock: Clock;
    logger: Logger;
    mailer: Mailer;
    tokenService: TokenService;
  }) {
    this.em = em;
    this.env = env;
    this.clock = clock;
    this.logger = logger;
    this.mailer = mailer;
    this.tokenService = tokenService;
  }

  /**
   * Mint a verification link and deliver it, or reject.
   *
   * **Sending lives here, not in `registerWithPassword`.** The spec's step 27 says
   * registration "sends verification"; this is how it does so, in one call. The link is a
   * composite of four decisions — the path, the TTL, the token's audience and subject, and
   * the copy — and registration is already not its only caller: B8 budgets a
   * "verification resend 3/email/hour" rate-limit policy, so a resend path is expected, and
   * two call sites each assembling a URL is how one of them ends up with a different TTL
   * than the mail body promises.
   *
   * It rejects when delivery fails, which is what lets registration fail closed with a
   * retryable 503 rather than report success for an account nobody can ever confirm (edge
   * case 29). Nothing is caught here: the mailer already normalises every provider failure
   * to `ServiceUnavailableError`.
   */
  async sendVerificationLink({ user, returnTo }: SendVerificationLinkInput): Promise<void> {
    const token = await this.tokenService.signPurposeToken({
      purpose: 'email-verify',
      // The whole claim. Not the email (it is on the row this id names), not the roles, and
      // above all not the password hash — see the note at the top of this file.
      subject: user.id,
      ttlSeconds: VERIFICATION_TTL_SECONDS,
    });

    const link = this.verificationUrl(token, returnTo);

    await this.mailer.send({
      to: user.email,
      subject: MAIL_SUBJECT,
      text: [
        'Confirm this address to finish creating your DevMentor account:',
        '',
        link,
        '',
        `The link works for ${VERIFICATION_TTL_SECONDS / 3600} hours. If it has expired, ` +
          'register again with the same address and a new link will be sent.',
        '',
        'If you did not sign up for DevMentor, ignore this message. The address cannot be ' +
          'used to sign in until this link is opened.',
      ].join('\n'),
    });

    // `userId` only. The link contains a live token, and a URL is a composed string that
    // pino's `redact` cannot reach inside — key names are what it matches (2026-09-10
    // lesson). Neither the link nor the token nor the address goes near a log line.
    this.logger.info({ userId: user.id }, 'sent an email verification link');
  }

  /**
   * Confirm an address from the token on a verification link.
   *
   * Returns `null` for every untrustworthy link — bad signature, wrong audience, expired,
   * malformed, or naming a user that no longer exists — because the route it serves is
   * browser-navigated and answers all of them the same way, with a redirect to
   * `/sign-in?error=verification`. Throwing would force a bare `try`/`catch` into the route
   * and risk rendering a JSON envelope into a browser window. Same split as
   * `TokenService.verifyPurposeToken` and `SessionService.verify`.
   *
   * **Opening an already-confirmed link is idempotent, not an error** (edge case 16), and
   * "idempotent" here has a concrete shape worth naming:
   *
   * - `email_verified_at` keeps its original value. It is the record of *when* the address
   *   was proven, so rewriting it on every visit would let a link-prefetcher falsify that
   *   fact — and, worse, re-verify a row that a future flow had deliberately un-verified.
   * - A session is still issued. This is the half that matters: mail scanners and
   *   link-prefetchers fetch the link before the human ever sees it, so if the second visit
   *   refused, or succeeded without signing anybody in, the scanner would have consumed the
   *   user's only way into their new account. The scanner's fetch and the user's click must
   *   produce the same answer, and that answer must be "you are in".
   *
   * The cost is that the link stays a working sign-in for its full TTL rather than burning
   * on first use, which is why that TTL is bounded by the session's — see
   * `VERIFICATION_TTL_SECONDS`.
   *
   * No lock and no transaction. Two simultaneous opens can both read a null
   * `email_verified_at` and both write a timestamp; the writes differ by microseconds and
   * either is a correct answer to "when was this proven", so serialising them would buy
   * nothing.
   */
  async verify(token: string): Promise<VerifiedAccount | null> {
    const claims = await this.tokenService.verifyPurposeToken({
      token,
      purpose: 'email-verify',
    });
    if (claims === null) {
      return null;
    }

    // A purpose token's subject may legitimately be `''` — the OAuth start route signs
    // exactly that for "no particular destination" — so `verifyPurposeToken` cannot reject
    // it, and the audience check is what normally keeps such a token away from here. This
    // service never signs an empty subject, so an empty one is not ours whatever it
    // verified against; refusing it here also keeps a non-uuid from reaching the driver as
    // a `where` value, which would be a 500 rather than a redirect.
    if (claims.subject === '') {
      return null;
    }

    const user = await this.em.findOne(User, { id: claims.subject });
    if (user === null) {
      // A valid link for a row that has since been deleted. Not an error: deleting an
      // account is legitimate, and there is nothing left to confirm or to sign in as.
      return null;
    }

    if (user.emailVerifiedAt) {
      this.logger.info(
        { userId: user.id },
        'reopened a verification link for an already confirmed address',
      );
    } else {
      user.emailVerifiedAt = this.clock.now();
      await this.em.flush();
      this.logger.info({ userId: user.id }, 'confirmed an email address');
    }

    return {
      userId: user.id,
      roles: normalizeRoles(user.roles),
      sessionVersion: user.sessionVersion,
    };
  }

  /**
   * The absolute link that goes in the mail.
   *
   * **`APP_URL` is correct here, and this is the documented exception to the 2026-09-10
   * lesson** that "any absolute self-URL is a latent cookie bug". That lesson is about
   * redirects issued to a browser that is *already on* one of our origins, where an
   * origin-relative `Location` is both simpler and safer. There is no origin in an inbox:
   * a mail client resolves nothing, so a relative link is not a link at all. `APP_URL` is
   * exactly what that lesson says it is for — "what is this deployment's canonical public
   * origin" — and answering that question is the whole job here. The same reasoning makes
   * the *real* GitHub adapter absolute while its test double is relative.
   *
   * `returnTo` is validated on the way out as well as on the way in. The route re-validates
   * it, so this is belt and braces, but it means we never *mail* a link containing an
   * off-site destination — which would look exactly like a phishing redirect to anyone
   * reading the message, whether or not the route would have honoured it.
   */
  private verificationUrl(token: string, returnTo: string | null | undefined): string {
    const url = new URL(VERIFY_EMAIL_PATH, this.env.APP_URL);
    url.searchParams.set('token', token);

    const destination = safeReturnTo(returnTo, '');
    if (destination !== '') {
      url.searchParams.set('returnTo', destination);
    }

    return url.toString();
  }
}

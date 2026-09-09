import type { AppEnv } from '../../config/env';
import { ServiceUnavailableError } from '../../http/errors';

/**
 * Key derivation for the `SESSION_SECRET` family, shared by the two services that sign
 * with it: `SessionService` (B2) and `TokenService` (B5).
 *
 * It lives in its own module because the rotation rule — *the previous secret verifies
 * and never signs* — is a single policy, and a second hand-written copy of it is exactly
 * the kind of thing that drifts: a service that forgot to append
 * `SESSION_SECRET_PREVIOUS` would keep working right up until the day someone rotates,
 * and then invalidate everything that service had issued. One implementation, one
 * ordering, one place to change if the family ever grows a third secret.
 *
 * What is deliberately *not* shared is the failure message. Both callers throw the same
 * `ServiceUnavailableError`, but a 503 that says "signed links are unavailable" during a
 * sign-in would send an operator looking in the wrong place, so each names its own
 * capability and passes the sentence in.
 */

const encoder = new TextEncoder();

/**
 * The slice of the environment these helpers read. Narrower than `AppEnv` on purpose:
 * it documents at the type level that key derivation depends on two variables and
 * nothing else, and it lets a test construct an input without inventing a whole
 * environment.
 */
export type SessionSecretEnv = Pick<AppEnv, 'SESSION_SECRET' | 'SESSION_SECRET_PREVIOUS'>;

/**
 * The one key anything ever signs with. Never the previous secret.
 *
 * @param unavailableMessage what the caller cannot do without the secret. It must name
 *   `SESSION_SECRET` and must never quote a value.
 */
export function signingKey(env: SessionSecretEnv, unavailableMessage: string): Uint8Array {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    // A misconfigured deployment, not an untrustworthy input: the caller cannot answer
    // at all, so this is a 503 rather than a `null` the caller would treat as "bad
    // token". `container.ts` refuses to build a production container without the
    // secret, so in practice this fires only in development.
    throw new ServiceUnavailableError(unavailableMessage);
  }
  return encoder.encode(secret);
}

/**
 * Keys accepted on verify, current first: a rotation that is only half deployed must not
 * invalidate the tokens and cookies already in flight. Order matters only for cost — a
 * current-secret token never pays for a second verification attempt.
 *
 * Note that a missing `SESSION_SECRET` throws here too, via `signingKey`. Verifying
 * against a rotation's tail alone would mean serving traffic we could not issue for.
 */
export function verificationKeys(
  env: SessionSecretEnv,
  unavailableMessage: string,
): Uint8Array[] {
  const keys = [signingKey(env, unavailableMessage)];
  const previous = env.SESSION_SECRET_PREVIOUS;
  if (previous) {
    keys.push(encoder.encode(previous));
  }
  return keys;
}

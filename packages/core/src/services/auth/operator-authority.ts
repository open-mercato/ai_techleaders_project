import { ROLES, type Role } from '@devmentor/db';

/**
 * The one implementation of D19's live-operator rule.
 *
 * > `users.roles` is the persisted assignment set. New accounts receive `mentee`.
 * > Invitation acceptance adds `mentor` without removing other roles. **`operator`
 * > authority is derived live from `OPERATOR_EMAILS` on every request**, matched against
 * > the row's own verified email. The stored `operator` membership is a queryability
 * > cache.
 *
 * It lives in `services/auth/` rather than in `http/auth.ts` because it has two callers
 * that must never disagree, and only one of them is HTTP:
 *
 * 1. `requireSession` (B3) derives the authoritative role set for the current request
 *    and persists nothing;
 * 2. `UserService`'s opportunistic reconciliation writes the derived set back to the
 *    cache, emits `auth.user.roles_changed`, and deliberately does not bump
 *    `session_version`.
 *
 * If the rule were written twice, a demotion could be honoured on the request path and
 * silently re-granted by the reconciliation path (or the reverse), which is exactly the
 * "two sources of truth" failure D19 exists to prevent. A service importing from `http/`
 * would also invert this package's own layering, so the shared rule sits under the
 * services it belongs to and `http/auth.ts` imports it.
 */

/** The stored fields the rule reads, and deliberately nothing else. */
export interface OperatorAuthoritySubject {
  /** The persisted assignment set — authoritative for every role except `operator`. */
  roles: readonly Role[];
  /** The row's own address. Never rewritten after creation, which is what makes it a key. */
  email: string;
  /**
   * When the address was proven, or nullish while it is not. `undefined` is in the type
   * because that is what `InferEntity` produces for a nullable column that has not been
   * selected or set; it means the same thing here as `null` — not verified.
   */
  emailVerifiedAt: Date | null | undefined;
}

/**
 * Whether the allowlist grants `operator` to this row, right now.
 *
 * **Verification is required.** An allowlisted address on an unverified row is not
 * evidence that the founder controls it — before E01 anyone could create a row for any
 * address — so an unverified row is never promoted, on either path.
 *
 * The allowlist arrives already trimmed and lower-cased: `OPERATOR_EMAILS` is normalized
 * once at parse time in `config/env.ts` precisely so this comparison is a plain lookup
 * rather than a per-call re-derivation. Only the row's own address is folded here.
 */
function isAllowlisted(
  subject: OperatorAuthoritySubject,
  operatorEmails: readonly string[],
): boolean {
  // Truthiness is safe and covers `null` and `undefined` in one branch: every `Date` is
  // truthy, including the epoch.
  if (!subject.emailVerifiedAt) {
    return false;
  }
  return operatorEmails.includes(subject.email.trim().toLowerCase());
}

/**
 * The live role set: the stored roles with `operator` taken from the allowlist instead.
 *
 * The correction is **symmetric**, which is the whole point of D19. Removing a founder
 * from `OPERATOR_EMAILS` drops their authority on their very next request; adding one
 * grants it on their next request too, without a sign-out/sign-in cycle. A
 * grant-only reconciliation would have made onboarding a founder depend on an
 * undocumented extra step (edge cases 24 and 25).
 *
 * The result is ordered by `ROLES` and duplicate-free, so two callers deriving the same
 * membership always produce an identical array. That is what lets the reconciliation
 * path compare its output against the stored column with a cheap equality check and skip
 * the write — and the event — when nothing actually changed.
 */
export function resolveLiveRoles(
  subject: OperatorAuthoritySubject,
  operatorEmails: readonly string[],
): Role[] {
  const held = new Set<Role>(subject.roles);

  if (isAllowlisted(subject, operatorEmails)) {
    held.add('operator');
  } else {
    held.delete('operator');
  }

  return ROLES.filter((role) => held.has(role));
}

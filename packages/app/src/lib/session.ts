import type { Role } from '@devmentor/core';

/**
 * Session helpers for the App Router — **F3** of
 * `.ai/specs/2026-09-04-accounts-and-roles.md`.
 *
 * This file is the designated home for `getPageSession`, `requirePageSession` and
 * `requirePageRole` as well; they arrive with the first guarded page. `homeFor` lands
 * first because the OAuth callback route needs it to decide where a fresh sign-in lands,
 * and the spec is explicit that this is *the single place the default landing is decided*
 * — a second copy inside the callback would be the drift that sends a mentor to `/home`
 * on sign-in and to `/mentor` on every navigation afterwards.
 */

/**
 * The page a user lands on when nothing more specific was asked for.
 *
 * Priority is `operator` → `/admin`, then `mentor` → `/mentor`, then `/home`. It is a
 * priority and not a partition: roles are independent assignments, a founder is usually a
 * mentor too, and combined-role navigation still exposes every permitted surface (Slice 3
 * builds it from the union of the held roles). This only answers "where do we open?".
 *
 * The asymmetry — `/home` for a mentee, `/mentor` for a mentor — is deliberate and comes
 * straight from the issues: #12 names `/home`, and #15 and #17 already write `/mentor` and
 * `/mentor/slots`.
 *
 * **The parameter is `readonly Role[]`, not the `readonly [Role, ...Role[]]` tuple the
 * spec sketched.** The tuple existed so this function would have no undefined case to
 * handle, and the `/home` fallback below already guarantees that: the function is total
 * for any input. Widening buys a second caller — the OAuth callback holds a `UserDto`,
 * whose `roles` is `readonly Role[]` — without a cast at the one place where a wrong cast
 * would be an authorization bug. A `Session`'s non-empty tuple is assignable to this, so
 * the page guards lose nothing.
 */
export function homeFor(roles: readonly Role[]): string {
  if (roles.includes('operator')) {
    return '/admin';
  }
  if (roles.includes('mentor')) {
    return '/mentor';
  }
  return '/home';
}

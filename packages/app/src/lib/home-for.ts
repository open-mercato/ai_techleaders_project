import type { Role } from '@devmentor/core';

/**
 * Where a signed-in user lands when nothing more specific was asked for.
 *
 * **Its own module, and importable from the browser.** It used to live in `lib/session.ts`
 * beside the page guards, which is where every *server* caller still reaches it from — but
 * that file imports `next/headers` and `next/navigation` at the top level, so importing it
 * from a Client Component is a build error rather than a dead import. The email sign-in form
 * needs this decision on the client: `POST /api/auth/login` answers `{ ok: true, data:
 * UserDto }` plus the session cookie, and the browser then has to navigate somewhere. A
 * separate pure module is what lets the client and the server reach the same answer instead
 * of the client guessing `/home` and stranding an operator on a page they will be redirected
 * off. `session.ts` re-exports it, so every existing import site is unchanged.
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
 * for any input. Widening buys two more callers — the OAuth callback and the login form
 * each hold a `UserDto`, whose `roles` is `readonly Role[]` — without a cast at the one
 * place where a wrong cast would be an authorization bug. A `Session`'s non-empty tuple is
 * assignable to this, so the page guards lose nothing.
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

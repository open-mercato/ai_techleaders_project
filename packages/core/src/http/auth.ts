import { User, type Role } from '@devmentor/db';
import type { Cradle } from '../container/cradle';
import { resolveLiveRoles } from '../services/auth/operator-authority';
import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * Authorization — platform primitives **B3**.
 *
 * `requireSession(req, cradle)` is the only authorization entry point, and it is a *live*
 * check, not a token read. Every guarded request verifies the cookie's signature, reloads
 * the user row, compares `users.session_version` against the token's `sv`, and derives the
 * role set from the stored column with `operator` resolved against `OPERATOR_EMAILS`.
 *
 * **Why nothing here trusts the token's claims alone.** The session cookie identifies a
 * user and carries a version; it carries no roles (B2). A role copy in the token would be
 * a second source of truth that a demotion could not reach until the cookie expired, and
 * the `session_version` comparison — the thing that makes sign-out end a *copied* cookie
 * (edge case 11) — is impossible without loading the row. So there is deliberately **no
 * exported cookie-only parser**: an authorization helper that could answer without a
 * database round trip would eventually be called on a path where the round trip mattered.
 *
 * **The cost is one indexed primary-key lookup**, and only one per scope. The lookup is
 * cached on the request scope's `session` key (`container/container.ts`), so a route guard
 * and a service that both need the session share a single `findOne`. Across a page render
 * the root layout, a nested layout and the page each open their own scope, so a signed-in
 * page may perform two or three identical lookups; that is accepted for E01 and recorded
 * in B3 as a known cost rather than papered over with a cache that would go stale exactly
 * where staleness is dangerous.
 */

/**
 * Re-exported from `@devmentor/db`, which owns the union: the `users.roles` column is
 * built from `ROLES` (that is what generates the membership `CHECK`), so a second
 * declaration here would be a second source of truth for the values the database already
 * constrains. `db` is the leaf package, so `core` and `app` can both reach it.
 */
export type { Role };

/**
 * The authenticated caller, as every guard and every service sees them.
 *
 * `roles` is a **non-empty tuple**, not `Role[]`: the column is constrained non-empty, and
 * `homeFor(roles)` (F3) must not have an undefined case to handle. Typing the guarantee
 * means the impossible state is unrepresentable downstream, at the cost of one explicit
 * narrowing here — see `toRoleSet`.
 */
export interface Session {
  userId: string;
  roles: readonly [Role, ...Role[]];
}

/**
 * The header `apiCall` sends on every request and `apiHandler` requires on every mutating
 * one. A `BACKWARD_COMPATIBILITY.md` §7 surface: renaming it here without renaming it in
 * `packages/ui/src/backend/api/apiCall.ts` rejects every mutation the app makes.
 */
export const CSRF_HEADER = 'x-devmentor-request';

/**
 * The methods a CSRF check does not apply to. `GET`/`HEAD` are the safe methods a
 * cross-site navigation can produce; `OPTIONS` is the preflight itself, which the browser
 * sends without our header and which must be allowed to be answered (or, as here, not
 * answered) on its own terms.
 */
const CSRF_EXEMPT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Edge case 30b, as an ordinary `Error` — logged by `apiHandler` and answered with a
 * generic 500 — and explicitly **not** an `UnauthorizedError`. A 401 would bounce a
 * perfectly valid session into `/sign-in`, which would re-authenticate it into the same
 * broken state: an infinite loop that also hides the data bug from whoever must fix it.
 * An `AppError` would be wrong for the other half of the reason — `apiHandler` treats the
 * typed hierarchy as *expected* and neither logs it nor hides its message.
 */
function corruptRoleSetError(userId: string): Error {
  return new Error(
    `User ${userId} has no roles. The users.roles column is constrained non-empty and ` +
      'every account holds at least one role besides operator, so this row is corrupt: ' +
      'repair the data rather than treating the request as unauthenticated.',
  );
}

/**
 * Turn the derived role list into the non-empty tuple `Session` promises. This is the
 * narrowing the tuple type forces, and it catches the second way the invariant can break:
 * a row whose *only* stored role is the `operator` cache, whose owner is then removed from
 * the allowlist, derives to nothing even though the column was never empty.
 */
function toRoleSet(roles: readonly Role[], userId: string): readonly [Role, ...Role[]] {
  const [first, ...rest] = roles;
  if (first === undefined) {
    throw corruptRoleSetError(userId);
  }
  return [first, ...rest];
}

/**
 * Exactly what resolving a session reads. Narrower than `Cradle` on purpose: the scoped
 * `session` registration resolves these three eagerly, so the dependency set is declared
 * in one place instead of being discovered by walking a proxy asynchronously.
 */
type SessionResolutionCradle = Pick<Cradle, 'sessionService' | 'em' | 'env'>;

/**
 * The live session behind a raw cookie value, or `null` if there isn't one.
 *
 * Not exported from `http/index.ts` and therefore not part of `@devmentor/core`'s public
 * surface: it is the resolver the request scope's lazy `session` key is built from, plus
 * the fallback `requireSession` uses when it is handed a scope that was not opened for
 * this request. Route and page code reaches the session through `requireSession` or the
 * scoped `session` key, never through this.
 *
 * Every untrustworthy cookie yields `null`, never a throw, so the caller decides what to
 * do about it. Only two things can throw: a missing `SESSION_SECRET` (`verify`'s
 * `ServiceUnavailableError` — a deployment that cannot authenticate anyone, not a claim
 * about this cookie) and a corrupt role set.
 */
export async function resolveSessionFromCookie(
  cookieValue: string | null,
  cradle: SessionResolutionCradle,
): Promise<Session | null> {
  if (cookieValue === null) {
    return null;
  }

  // Signature, audience and expiry. Tampered, expired, malformed, or signed with a secret
  // we do not know all arrive here identically, as `null` (edge case 10).
  const claims = await cradle.sessionService.verify(cookieValue);
  if (claims === null) {
    return null;
  }

  // The one lookup. It is what makes `sv` real, and it is also what loads the roles, which
  // is why B2 could reject a session table without adding a second round trip.
  const user = await cradle.em.findOne(User, { id: claims.userId });
  if (user === null) {
    // A cookie for a user that no longer exists is simply not a session. 401, not 500 —
    // deleting a row is a legitimate operation, unlike an empty role set.
    return null;
  }

  if (user.sessionVersion !== claims.sessionVersion) {
    // Sign-out, a password change or a role grant bumped the column, so every token issued
    // before it is dead — including a copy taken from another machine (edge case 11).
    return null;
  }

  if (user.roles.length === 0) {
    // Checked before the live derivation, because the derivation would otherwise mask the
    // corruption whenever the empty row's address happens to be allowlisted (edge case 30b).
    throw corruptRoleSetError(user.id);
  }

  return {
    userId: user.id,
    // Stored roles win for `mentee`/`mentor`; `operator` is taken from the allowlist in
    // both directions, on every request, so a removed founder loses access immediately and
    // an added one gains it without signing out (edge cases 24 and 25).
    roles: toRoleSet(resolveLiveRoles(user, cradle.env.OPERATOR_EMAILS), user.id),
  };
}

/**
 * The session for `req`, preferring the scope's cached resolution.
 *
 * `withRequestScope(req, ...)` registers the request's cookie on the scope, so the common
 * path finds the value it is holding and reuses the single `findOne` the scope already
 * performed (or is about to). The mismatch branch covers a caller that opened a plain
 * `withScope` — system work, or a scope opened for a different request — and resolves
 * independently rather than answering from someone else's cookie, which is the only
 * failure mode worth spending a comparison on.
 */
function sessionFor(req: Request, cradle: Cradle): Promise<Session | null> {
  const cookieValue = cradle.sessionService.readCookie(req);
  if (cookieValue === cradle.sessionCookie) {
    return cradle.session;
  }
  return resolveSessionFromCookie(cookieValue, cradle);
}

/**
 * Require an authenticated session or throw `UnauthorizedError` (401).
 *
 * The canonical guard. Every protected route calls this before touching a service, and
 * every guarded page calls the F3 helper that wraps it — never a layout alone, because App
 * Router layouts do not re-render on client-side navigation and would let a revoked
 * operator walk from `/admin` to `/admin/users` (edge case 21).
 */
export async function requireSession(req: Request, cradle: Cradle): Promise<Session> {
  const session = await sessionFor(req, cradle);
  if (session === null) {
    throw new UnauthorizedError();
  }
  return session;
}

/**
 * Require the session to hold a specific role or throw `ForbiddenError` (403).
 *
 * Membership, not equality: a user may hold several roles at once — mentor and operator
 * are independent assignments, not mutually exclusive personas. There is deliberately no
 * `requireAnyRole` and no role-dispatch helper; a route that serves one persona names that
 * persona, and a check that must accept either side of a relationship is a *party* check,
 * which is a different question (B3/B4).
 *
 * Returns the session so a guard reads as one expression. Note it returns `Session`, not
 * `void`, so `makeCrudRoute`'s `authorize` hook needs a braced body.
 */
export function requireRole(session: Session, role: Role): Session {
  if (!session.roles.includes(role)) {
    throw new ForbiddenError();
  }
  return session;
}

/**
 * Assert the session owns the resource identified by `ownerId`, else throw
 * `ForbiddenError` (403). Use for every mutation — a mentee may only act on their own
 * bookings, a mentor only on their own profile and availability.
 */
export function assertOwnership(session: Session, ownerId: string): void {
  if (session.userId !== ownerId) {
    throw new ForbiddenError();
  }
}

/**
 * Require the CSRF header on a state-changing request, else throw `ForbiddenError` (403).
 *
 * **Exported, but no route calls it.** `apiHandler` invokes it for every method other than
 * `GET`, `HEAD` and `OPTIONS`, so `makeCrudRoute`'s mutating verbs inherit the check and a
 * forgotten one is impossible by construction — a rule restated per story is a rule that
 * eventually gets restated wrong. It stays a named export so the rule itself is greppable
 * and directly testable, separately from any route that happens to exercise it.
 *
 * **Why a header is enough.** A cross-origin `fetch` carrying a custom header triggers a
 * CORS preflight this app never answers, and a plain HTML form post cannot set a header at
 * all. Two consequences the codebase depends on: every state-changing `/api/*` route is
 * JSON-only and is called through `apiCall` or `CrudForm`, never a native form; and
 * `apiCall` already sends the header on every request, so this costs the client nothing.
 */
export function requireCsrfHeader(req: Request): void {
  if (CSRF_EXEMPT_METHODS.has(req.method.toUpperCase())) {
    return;
  }
  if (req.headers.get(CSRF_HEADER) === null) {
    throw new ForbiddenError(
      `This request must carry the ${CSRF_HEADER} header. Send it through the app rather ` +
        'than as a plain form submission.',
    );
  }
}

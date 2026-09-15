import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { homeFor } from './home-for';
import {
  SESSION_COOKIE_NAME,
  safeReturnTo,
  withCookieScope,
  type Cradle,
  type Role,
  type Session,
} from '@devmentor/core';

/**
 * Session helpers for the App Router — **F3** of
 * `.ai/specs/2026-09-04-accounts-and-roles.md`.
 *
 * This file exists because `core` must not import `next` (a rule `eslint.config.mjs` now
 * enforces): `core/src/http/auth.ts` takes a plain `Request`, and the `next/headers` cookie
 * read plus **every** `redirect()` in the app's page tree live here. `homeFor` landed first,
 * with the OAuth callback that needed it; the three guards join it here.
 *
 * The two rules the guards encode, both from the spec's UI/UX section:
 *
 * - **No session → `/sign-in?returnTo=<current>`.** The visitor is not signed in, so send
 *   them to sign in and bring them back.
 * - **Wrong role → `homeFor(session.roles)`.** They *are* signed in; bouncing them to
 *   `/sign-in` would ask them to re-authenticate into exactly the same refusal, which for a
 *   mentee who clicked a mentor link is a loop with no exit (edge cases 19 and 20).
 *
 * And the rule that decides *where* they are called: **a layout is not the boundary.** App
 * Router layouts do not re-render on client-side navigation, so a guard living only in
 * `admin/layout.tsx` never runs when the router fetches `/admin/users` as a segment — the
 * revoked operator of edge case 21 would be served the page. Every guarded `page.tsx` calls
 * a guard itself, and the service behind it checks independently.
 */

/** Where a visitor with no session is sent. */
const SIGN_IN_PATH = '/sign-in';

/**
 * The page a user lands on when nothing more specific was asked for.
 *
 * Defined in `lib/home-for.ts` and re-exported here, where its server callers already look
 * for it. It moved out because Slice 4's email sign-in form is a Client Component and needs
 * the same decision: this file imports `next/headers`, so importing *it* from the browser is
 * a build error. See that module for the priority and why the parameter is a plain array.
 */
export { homeFor };

/**
 * The live session behind the request's cookie, or `null` if there isn't one.
 *
 * The page-side twin of `requireSession(req, cradle)`, and the same operation underneath:
 * `withCookieScope` opens a request scope carrying the (still unverified) cookie value, and
 * the scope's lazy `session` key verifies the JWT, compares `session_version` against the
 * stored row and derives the live role set. Nothing here trusts a token claim, so a founder
 * removed from `OPERATOR_EMAILS` loses `/admin` on their next navigation rather than when
 * their cookie expires.
 *
 * A tampered, expired or unknown cookie is `null`, not a throw (edge case 10). Two things do
 * throw and are deliberately not caught: a corrupt role set (edge case 30b) and a deployment
 * with no `SESSION_SECRET` — a 500 that says a real thing is worth more than a redirect to a
 * sign-in page that cannot possibly work.
 *
 * Note this costs one indexed lookup **per scope**, and a layout, a nested layout and the
 * page each open their own. That repetition is the accepted price of the live check (B3).
 */
/**
 * Run `fn` in a scope carrying this request's cookie, so a service it calls can resolve the
 * caller and authorize for itself.
 *
 * The page-side twin of `withRequestScope`, and the reason a page never imports
 * `next/headers` itself: this file is the one place the cookie is read, so a page that needs
 * a scoped service asks for one here rather than opening its own. A service reached this way
 * makes its own authorization decision — `metricsSince` refuses a non-operator — so a page
 * cannot show a number to somebody the service would have refused.
 */
export async function withPageScope<T>(fn: (cradle: Cradle) => Promise<T> | T): Promise<T> {
  const cookieStore = await cookies();
  return withCookieScope(cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null, fn);
}

export async function getPageSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  return withCookieScope(
    cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null,
    ({ session }) => session,
  );
}

/**
 * `/sign-in`, carrying `returnTo` when `currentPath` is somewhere we could send a browser
 * back to.
 *
 * `safeReturnTo` runs on a value this app supplied, which looks redundant until a dynamic
 * segment is interpolated into it — `/mentors/${slug}` puts user-controlled text in the path
 * — and the fallback is `''` rather than a home, because the sign-in page's own default
 * landing is `homeFor` and a guessed `returnTo` would override it with something worse.
 */
function signInPathFor(currentPath: string): string {
  const returnTo = safeReturnTo(currentPath, '');
  if (returnTo === '') {
    return SIGN_IN_PATH;
  }
  return `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Require a session, or redirect to sign-in and never return.
 *
 * **`currentPath` is a parameter because Next 16 gives a Server Component no way to ask.**
 * `headers()` exposes the incoming HTTP headers and nothing synthetic; `usePathname` is
 * documented as "a **Client Component** hook" (`use-pathname.md`) and this runs on the
 * server; `nextUrl.pathname` belongs to `NextRequest`, which only a Route Handler or the
 * proxy holds (`next-request.md`). The alternatives are a proxy that stamps a header on
 * every request — machinery, plus a second place the path can be wrong — or passing the
 * literal each page already knows. So the caller passes it:
 *
 * ```ts
 * const session = await requirePageRole('operator', '/admin/users');
 * ```
 *
 * `redirect()` **throws** (`NEXT_REDIRECT`) rather than returning, which is what makes
 * *"nothing of the user's is rendered first"* (#12) true: the segment's render is abandoned
 * at the guard. It is typed `never`, so the narrowing below needs no `return`.
 */
export async function requirePageSession(currentPath: string): Promise<Session> {
  const session = await getPageSession();
  if (session === null) {
    redirect(signInPathFor(currentPath));
  }
  return session;
}

/**
 * Send a visitor who already holds a valid session to their role home, or return and let
 * `/sign-in` render its form (edge case 28).
 *
 * The mirror image of `requirePageSession`, and it lives here for the same reason: this
 * file owns every `redirect()` in the page tree, so the sign-in page never imports
 * `next/navigation` itself. A signed-in visitor who lands back on `/sign-in` — a stale tab,
 * a bookmark, the browser's back button after signing in — has nothing to do there, and
 * sending them through GitHub a second time would cost a round trip to arrive exactly where
 * they already are.
 *
 * The destination is `homeFor(roles)` and deliberately **not** `?returnTo`: that parameter
 * is honoured by the OAuth flow itself (`/api/auth/github` carries it through the round trip
 * as the state token's subject), so the only visitor reaching this branch is one whose
 * sign-in already finished. Their home is the one destination that is always right.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await getPageSession();
  if (session !== null) {
    redirect(homeFor(session.roles));
  }
}

/**
 * Require a session holding `role`, or redirect and never return.
 *
 * Membership, not equality — mentor and operator are independent assignments, so an operator
 * who is also a mentor passes both — and it mirrors `requireRole`'s 403 on the API side of
 * the same screen. A signed-in caller without the role goes to their **own** home, so the
 * refusal ends somewhere they can actually use.
 */
export async function requirePageRole(role: Role, currentPath: string): Promise<Session> {
  const session = await requirePageSession(currentPath);
  if (!session.roles.includes(role)) {
    redirect(homeFor(session.roles));
  }
  return session;
}

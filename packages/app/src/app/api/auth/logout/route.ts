import { apiHandler, jsonOk, withRequestScope } from '@devmentor/core';

// Reads the session cookie and writes one back; never a cached answer.
export const dynamic = 'force-dynamic';

/**
 * Sign out.
 *
 * **CSRF but no session** (API Contracts). `apiHandler` requires `x-devmentor-request` on
 * every non-`GET`, so the header check comes for free and cannot be forgotten; a session,
 * deliberately, is not required. Under the obvious rule — "sign-out needs a valid session"
 * — an expired cookie answers 401 and leaves the stale cookie exactly where it was, so a
 * user who most wants to be signed out is the one who cannot get there without opening
 * browser settings (edge case 27). Sign-out is the one operation that must always succeed.
 *
 * Two things happen, and only the first always happens:
 *
 * - The cookie is expired. `SessionService.clear()` needs no session and not even a
 *   configured `SESSION_SECRET`.
 * - `session_version` is bumped, **only when a live session was actually presented**. That
 *   is what ends a cookie someone copied off this machine rather than letting it run its
 *   remaining 24 hours (edge case 11). With no live session there is no row to attribute a
 *   bump to and nothing to revoke.
 *
 * Unlike the two OAuth `GET`s this one is fetched, not navigated: it is called through
 * `apiCall` from the sign-out `WorkflowAction`, so the JSON envelope is the right answer
 * and `apiHandler`'s normal error handling applies. `jsonOk` builds it; the cookie is
 * appended to that response because only a route handler can set one.
 */
export const POST = apiHandler(async (req) =>
  withRequestScope(req, async ({ session, sessionService, userService }) => {
    // A rejection here — a corrupt role set, or a `SESSION_SECRET` this deployment no
    // longer has — reads the same as "no live session", which for sign-out is the honest
    // answer: whatever the reason, we cannot attribute a bump to a user, and refusing
    // would strand the caller with a cookie they cannot get rid of. The one thing this
    // must not do is turn that into a failed sign-out.
    const live = await session.catch(() => null);
    if (live !== null) {
      await userService.endAllSessions(live.userId);
    }

    const response = jsonOk(null);
    response.headers.append('set-cookie', sessionService.clear());
    return response;
  }),
);

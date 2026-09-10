import {
  apiHandler,
  clientIpFromHeaders,
  jsonOk,
  loginSchema,
  parseJsonBody,
  withScope,
} from '@devmentor/core';

// Checks a credential, consumes rate-limit counters and sets the session cookie.
export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/login` — sign in with an email address and a password (#13), the D07
 * fallback to GitHub and on exactly the same session.
 *
 * **Fetched, not navigated**, like its neighbour `register` and unlike `verify-email`: the
 * sign-in form calls it through `apiCall`, so it answers the envelope and `apiHandler` maps
 * every failure onto it. CSRF is `apiHandler`'s (primitives B3) and the rate limit is
 * `UserService.authenticateWithPassword`'s — it consumes the per-IP *and* per-email counters
 * inside the hashing gate slot, before any credential work, so the count never depends on
 * whether the address exists or the password matched. The route's one contribution is the
 * client IP, which is the only part of that decision only a route can see.
 *
 * **Success is `{ ok: true, data: UserDto }` plus the session cookie.** The cookie is
 * appended to the response here because only a route handler can set one in the App Router;
 * `SessionService.issue` mints it and `UserService` returns the `session_version` to sign it
 * from, and neither builds a response. The DTO is what the browser navigates on: it carries
 * `roles`, so the form sends the user to `homeFor(roles)` when no `?returnTo` was asked for,
 * rather than guessing `/home` and bouncing an operator.
 *
 * **Every failure is the service's, and the generic one is the point.** An unknown address,
 * a GitHub-only account and a wrong password all raise the same `401 unauthorized` with the
 * same message (edge case 13), an unconfirmed address is refused with its own reason and no
 * session (edge case 15), a tripped counter is `429 rate_limited` with `retryAfterSeconds`
 * and a `Retry-After` header (edge case 17), and a saturated hashing gate is `503`. **None
 * of them reaches the cookie line below**, because they throw — so a refused sign-in sets no
 * `Set-Cookie` at all, which is the property the tests and the integration scenario assert
 * rather than infer.
 *
 * `loginSchema` accepts an optional `returnTo` and this route ignores it: nothing here
 * redirects, so the destination is the browser's business and is decided by the form from
 * its own URL. Parsing it anyway keeps one schema for both call sites.
 */
export const POST = apiHandler(async (req) => {
  const input = await parseJsonBody(req, loginSchema);

  return withScope(async ({ env, logger, sessionService, userService }) => {
    // `withScope`, not `withRequestScope`: whatever session cookie the browser is holding is
    // irrelevant to whether this credential is correct, and this request is about to replace
    // it either way.
    const clientIp = clientIpFromHeaders(req.headers, {
      trustedProxyHops: env.TRUSTED_PROXY_HOPS,
      logger,
    });

    const { user, sessionVersion } = await userService.authenticateWithPassword({
      email: input.email,
      password: input.password,
      clientIp,
    });
    const { cookie } = await sessionService.issue({ id: user.id, sessionVersion });

    const response = jsonOk(user);
    response.headers.append('set-cookie', cookie);
    return response;
  });
});

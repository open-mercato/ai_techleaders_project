import {
  apiHandler,
  clientIpFromHeaders,
  parseJsonBody,
  registerSchema,
  withScope,
} from '@devmentor/core';

// Reads a request body, consumes a rate-limit counter, hashes, writes a row and sends mail.
export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/register` — create an account with an email address and a password (#13).
 *
 * **Fetched, not navigated.** It is called through `CrudForm` → `apiCall`, so the JSON
 * envelope is the right answer to everything and `apiHandler`'s normal error handling
 * applies — the opposite of the two OAuth `GET`s and of `verify-email` next door, which a
 * browser opens directly and which therefore answer with redirects. Deciding which kind a
 * route is comes before writing it; the two error paths are not interchangeable.
 *
 * **CSRF comes from `apiHandler` and is deliberately not requested here.** It requires
 * `x-devmentor-request` on every method other than `GET`, `HEAD` and `OPTIONS` (primitives
 * B3), so a route that called `requireCsrfHeader` itself would be duplicating a check it
 * cannot opt out of anyway — and a route that forgot to is impossible. `apiCall` sends the
 * header on every request, and a plain HTML form post cannot set it, which is the whole
 * defence.
 *
 * **The rate limit is also not here, and that is not an omission.**
 * `UserService.registerWithPassword` acquires the hashing gate slot, *then* consumes the
 * per-IP registration counter, *then* hashes — an ordering that is load-bearing (edge case
 * 18: a 503 from a saturated gate must not have charged the counter). Consuming a second
 * counter at the route would double-charge every attempt and put half the ordering outside
 * the method that documents it. What the route owes the service is the one thing only the
 * route can see: the client IP.
 *
 * **It answers `{ ok: true, data: { email } }` and sets no cookie.** Registration never
 * signs anybody in — `email_verified_at` gates sign-in, and only the link this request mails
 * out can set it. Returning a session here would hand one out for an address nobody has
 * proven, which is exactly the takeover the verification step exists to prevent.
 *
 * **`?returnTo` is read from the query as well as the body, and the body wins.** The body is
 * the contract (`registerSchema` carries an optional `returnTo`, and an API client sends it
 * there); the query is how `CrudForm` carries one. `CrudForm` submits exactly the fields it
 * renders, and a destination the user never sees is not a field — giving it a label and a
 * row of vertical rhythm to hide an `<input type="hidden">` would be the worse trade. So the
 * form points at `/api/auth/register?returnTo=…` and this route merges the two sources in
 * one place. Neither source is trusted: `safeReturnTo` re-validates the value when the link
 * is built and again when it is opened, and anything it rejects becomes the role home.
 *
 * Failures are the service's and are already the right envelope: `409 conflict` for an
 * address that already has an account (generic) or is tied to a GitHub one (the deliberate
 * oracle recorded in the spec), `422 validation_failed` with `fieldErrors` from the schema,
 * `429 rate_limited` with `Retry-After`, and `503 service_unavailable` when the hashing gate
 * is saturated or the mail could not be delivered (edge case 29 — a registration that could
 * not send its link fails rather than reporting a success nobody can act on).
 */
export const POST = apiHandler(async (req) => {
  const input = await parseJsonBody(req, registerSchema);

  return withScope(async ({ env, logger, userService }) => {
    // `withScope`, not `withRequestScope`: registration is for someone who has no account,
    // so there is no session to resolve and no cookie worth reading.
    const clientIp = clientIpFromHeaders(req.headers, {
      trustedProxyHops: env.TRUSTED_PROXY_HOPS,
      logger,
    });

    return userService.registerWithPassword({
      ...input,
      returnTo: input.returnTo ?? new URL(req.url).searchParams.get('returnTo'),
      clientIp,
    });
  });
});

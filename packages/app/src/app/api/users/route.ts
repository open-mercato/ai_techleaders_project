import { makeCrudRoute, requireRole, requireSession } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Reference CRUD route: `route.ts` is configuration, not logic. `GET` is generated from
 * the service by `makeCrudRoute`; item-level verbs would live in `users/[id]/route.ts`
 * off the same config.
 *
 * **`GET` is operator-only and `POST` is gone.** The collection exposes every account's
 * email and role set, so it moved under the operator guard in the same slice that gave
 * accounts real data to protect. `POST` was public and had zero callers, and creating an
 * unverified row for an address you do not own is the account-takeover vector the GitHub
 * linking rule exists to close — so the verb is removed rather than guarded, and the only
 * way a row is created now is by signing in (Slice 4 adds registration). Next answers a
 * `POST` here with 405 because nothing is exported for it.
 *
 * The guard is deliberately duplicated: this hook denies before the service is even
 * resolved, and `UserService.list` refuses independently. The service check is the
 * guarantee — this one is defence in depth (edge case 21). A braced body is required:
 * `requireRole` returns the `Session`, and `authorize` returns `void`.
 */
export const { GET } = makeCrudRoute({
  resolve: (cradle) => cradle.userService,
  authorize: async (req, cradle) => {
    requireRole(await requireSession(req, cradle), 'operator');
  },
});

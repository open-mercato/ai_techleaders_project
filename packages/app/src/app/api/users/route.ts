import { makeCrudRoute, userCreateSchema } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Reference CRUD route: `route.ts` is configuration, not logic. The collection
 * verbs (`GET` list, `POST` create) are generated from the service + Zod schema by
 * `makeCrudRoute`; item-level verbs would live in `users/[id]/route.ts` off the same
 * config.
 *
 * NOTE: this endpoint is intentionally public for now — it is the migration
 * regression check until real concepts replace it. The `auth` concept will add
 * `authorize: (req) => requireSession(req)` here.
 */
export const { GET, POST } = makeCrudRoute({
  resolve: (cradle) => cradle.userService,
  createSchema: userCreateSchema,
});

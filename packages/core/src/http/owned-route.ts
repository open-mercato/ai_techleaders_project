import { withRequestScope } from '../container/container';
import type { Cradle } from '../container/cradle';
import { apiHandler, type ApiRouteHandler } from './apiHandler';
import { requireRole, requireSession, type Role } from './auth';

export type OwnedRouteParams = Record<string, string | string[]> | undefined;

export interface OwnedActionOptions<Result> {
  /** Omit only for a signed-in transition that grants its own role, such as invite acceptance. */
  role?: Role;
  /**
   * Perform the concept action inside the caller's request scope.
   *
   * Returning ordinary data lets `apiHandler` create the standard success envelope.
   * Returning a `Response` passes it through unchanged, which is required when a route
   * must attach a refreshed session cookie after committing its transaction.
   */
  run: (
    req: Request,
    cradle: Cradle,
    params: OwnedRouteParams,
  ) => Promise<Result | Response> | Result | Response;
}

/**
 * Build one authenticated workflow handler without imposing a CRUD service shape.
 *
 * The route guard is visible here for defence in depth. The concept service reached by
 * `run` remains the ownership authority and resolves the same scoped session. CSRF is
 * deliberately absent: `apiHandler` is its one central owner for every mutating verb.
 */
export function ownedAction<Result>(options: OwnedActionOptions<Result>): ApiRouteHandler {
  return apiHandler((req, ctx) =>
    withRequestScope(req, async (cradle) => {
      const session = await requireSession(req, cradle);
      if (options.role !== undefined) {
        requireRole(session, options.role);
      }

      // Collection-style handlers receive no context in Next. Keep the same guard as
      // `makeCrudRoute` so this helper is safe for both parameterized and fixed actions.
      const params = ctx?.params ? await ctx.params : undefined;
      return options.run(req, cradle, params);
    }),
  );
}

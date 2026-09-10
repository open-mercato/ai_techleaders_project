import { withRequestScope } from '../container/container';
import type { Cradle } from '../container/cradle';
import { apiHandler, type ApiRouteHandler } from './apiHandler';
import { BadRequestError } from './errors';
import { parseJsonBody } from './makeCrudRoute';
import { requireRole, requireSession, type Role } from './auth';
import type { z } from 'zod';

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

type OwnedOperation<Result> = OwnedActionOptions<Result>['run'];

export interface OwnedResourceRouteOptions<Entity, UpdateInput> {
  role?: Role;
  get?: OwnedOperation<Entity>;
  update?: (
    req: Request,
    cradle: Cradle,
    params: OwnedRouteParams,
    input: UpdateInput,
  ) => Promise<Entity | Response> | Entity | Response;
  updateSchema?: z.ZodType<UpdateInput>;
}

export interface OwnedCollectionRouteOptions<Entity, CreateInput> {
  role?: Role;
  list?: OwnedOperation<Entity[]>;
  create?: (
    req: Request,
    cradle: Cradle,
    params: OwnedRouteParams,
    input: CreateInput,
  ) => Promise<Entity | Response> | Entity | Response;
  createSchema?: z.ZodType<CreateInput>;
}

async function inOwnedScope<Result>(
  req: Request,
  ctx: Parameters<ApiRouteHandler>[1],
  role: Role | undefined,
  run: OwnedOperation<Result>,
): Promise<Result | Response> {
  return withRequestScope(req, async (cradle) => {
    const session = await requireSession(req, cradle);
    if (role !== undefined) requireRole(session, role);
    const params = ctx?.params ? await ctx.params : undefined;
    return run(req, cradle, params);
  });
}

/**
 * Build one authenticated workflow handler without imposing a CRUD service shape.
 *
 * The route guard is visible here for defence in depth. The concept service reached by
 * `run` remains the ownership authority and resolves the same scoped session. CSRF is
 * deliberately absent: `apiHandler` is its one central owner for every mutating verb.
 */
export function ownedAction<Result>(options: OwnedActionOptions<Result>): ApiRouteHandler {
  return apiHandler((req, ctx) => inOwnedScope(req, ctx, options.role, options.run));
}

/** Build the GET/PUT pair for one singleton owned by the signed-in caller. */
export function makeOwnedResourceRoute<Entity, UpdateInput = never>(
  options: OwnedResourceRouteOptions<Entity, UpdateInput>,
) {
  const GET = apiHandler((req, ctx) =>
    inOwnedScope(req, ctx, options.role, (request, cradle, params) => {
      if (options.get === undefined) throw new BadRequestError('This operation is not supported');
      return options.get(request, cradle, params);
    }),
  );
  const PUT = apiHandler((req, ctx) =>
    inOwnedScope(req, ctx, options.role, async (request, cradle, params) => {
      if (options.update === undefined || options.updateSchema === undefined) {
        throw new BadRequestError('This operation is not supported');
      }
      const input = await parseJsonBody(request, options.updateSchema);
      return options.update(request, cradle, params, input);
    }),
  );
  return { GET, PUT };
}

/** Build the GET/POST pair for a caller-owned collection without accepting an owner id. */
export function makeOwnedCollectionRoute<Entity, CreateInput = never>(
  options: OwnedCollectionRouteOptions<Entity, CreateInput>,
) {
  const GET = apiHandler((req, ctx) =>
    inOwnedScope(req, ctx, options.role, (request, cradle, params) => {
      if (options.list === undefined) throw new BadRequestError('This operation is not supported');
      return options.list(request, cradle, params);
    }),
  );
  const POST = apiHandler((req, ctx) =>
    inOwnedScope(req, ctx, options.role, async (request, cradle, params) => {
      if (options.create === undefined || options.createSchema === undefined) {
        throw new BadRequestError('This operation is not supported');
      }
      const input = await parseJsonBody(request, options.createSchema);
      return options.create(request, cradle, params, input);
    }),
  );
  return { GET, POST };
}

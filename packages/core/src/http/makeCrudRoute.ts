import { z } from 'zod';
import { withRequestScope } from '../container/container';
import type { Cradle } from '../container/cradle';
import { apiHandler, type ApiRouteContext } from './apiHandler';
import { BadRequestError, type FieldErrors, ValidationError } from './errors';

/**
 * The service shape a CRUD route drives. Every method is optional except `list` — a
 * resource wires up only the verbs it supports; calling an unsupported verb yields a
 * `400` rather than a crash.
 */
export interface CrudService<Entity, CreateInput, UpdateInput> {
  list(): Promise<Entity[]>;
  get?(id: string): Promise<Entity>;
  create?(data: CreateInput): Promise<Entity>;
  update?(id: string, data: UpdateInput): Promise<Entity>;
  delete?(id: string): Promise<void>;
}

export interface MakeCrudRouteOptions<Entity, CreateInput, UpdateInput> {
  /** Resolve the concept's service from the request-scoped cradle. */
  resolve: (cradle: Cradle) => CrudService<Entity, CreateInput, UpdateInput>;
  /** Zod schema for `POST` bodies. Required to enable `create`. */
  createSchema?: z.ZodType<CreateInput>;
  /** Zod schema for `PUT` bodies. Required to enable `update`. */
  updateSchema?: z.ZodType<UpdateInput>;
  /** Route param carrying the resource id for item-level verbs. Defaults to `id`. */
  idParam?: string;
  /**
   * Runs before any verb. Throw an `AppError` (e.g. from `requireSession`) to deny.
   * Omit only for endpoints that are explicitly public.
   */
  authorize?: (req: Request, cradle: Cradle) => void | Promise<void>;
}

function flattenZodError(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_root';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
}

function parseWith<T>(schema: z.ZodType<T> | undefined, data: unknown): T {
  if (!schema) {
    throw new BadRequestError('This operation is not supported');
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Validation failed', flattenZodError(result.error));
  }
  return result.data;
}

/**
 * Build `{ GET, POST, PUT, DELETE }` route handlers from a service + Zod schemas, so
 * a `route.ts` becomes configuration rather than logic. Collection routes re-export
 * `{ GET, POST }`; an `[id]/route.ts` re-exports `{ GET, PUT, DELETE }` from the same
 * config. Workflow endpoints that aren't plain CRUD use `apiHandler` directly instead.
 */
export function makeCrudRoute<Entity, CreateInput = never, UpdateInput = never>(
  options: MakeCrudRouteOptions<Entity, CreateInput, UpdateInput>,
) {
  const idParam = options.idParam ?? 'id';

  async function idFrom(ctx: ApiRouteContext): Promise<string | undefined> {
    // Collection routes (e.g. `/api/users`) are non-dynamic, so Next provides no
    // params at all — guard rather than assume `ctx.params` is present.
    const params = ctx?.params ? await ctx.params : undefined;
    const raw = params?.[idParam];
    return Array.isArray(raw) ? raw[0] : raw;
  }

  // `withRequestScope`, not `withScope`: the scope carries the request's session cookie, so
  // an `authorize` hook calling `requireSession` and a service that also depends on the
  // scoped `session` see the same session from a single lookup. A request with no cookie
  // resolves to `null` and costs nothing, so a public route is unaffected.
  function run<T>(req: Request, fn: (cradle: Cradle) => Promise<T>): Promise<T> {
    return withRequestScope(req, async (cradle) => {
      await options.authorize?.(req, cradle);
      return fn(cradle);
    });
  }

  const GET = apiHandler((req, ctx) =>
    run(req, async (cradle) => {
      const service = options.resolve(cradle);
      const id = await idFrom(ctx);
      if (id !== undefined) {
        if (!service.get) throw new BadRequestError('This operation is not supported');
        return service.get(id);
      }
      return service.list();
    }),
  );

  const POST = apiHandler((req) =>
    run(req, async (cradle) => {
      const service = options.resolve(cradle);
      if (!service.create) throw new BadRequestError('This operation is not supported');
      return service.create(parseWith(options.createSchema, await readJsonBody(req)));
    }),
  );

  const PUT = apiHandler((req, ctx) =>
    run(req, async (cradle) => {
      const service = options.resolve(cradle);
      const id = await idFrom(ctx);
      if (id === undefined) throw new BadRequestError('Missing resource id');
      if (!service.update) throw new BadRequestError('This operation is not supported');
      return service.update(id, parseWith(options.updateSchema, await readJsonBody(req)));
    }),
  );

  const DELETE = apiHandler((req, ctx) =>
    run(req, async (cradle) => {
      const service = options.resolve(cradle);
      const id = await idFrom(ctx);
      if (id === undefined) throw new BadRequestError('Missing resource id');
      if (!service.delete) throw new BadRequestError('This operation is not supported');
      await service.delete(id);
      return { id };
    }),
  );

  return { GET, POST, PUT, DELETE };
}

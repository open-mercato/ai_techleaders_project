import { createLogger, type Logger } from '../logger';
import { type FieldErrors, isAppError } from './errors';

/**
 * The response envelope every `/api/*` route returns. This is a *shape convention*
 * shared with the client (`@devmentor/ui/backend/api`), which declares its own
 * matching type — `ui` must not import `core`, so the two are intentionally separate
 * declarations of the same shape.
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; fieldErrors?: FieldErrors };
};
export type ApiResponseBody<T> = ApiSuccess<T> | ApiFailure;

/** Next passes `params` as a promise in the route context (App Router). */
export type ApiRouteContext = { params: Promise<Record<string, string | string[]>> };

export type ApiRouteHandler = (req: Request, ctx: ApiRouteContext) => Promise<Response>;

/** Route logic: return the payload to wrap, or a `Response` to pass through as-is. */
export type RouteLogic = (req: Request, ctx: ApiRouteContext) => Promise<unknown> | unknown;

let cachedLogger: Logger | undefined;
function logger(): Logger {
  return (cachedLogger ??= createLogger());
}

function json(
  status: number,
  body: ApiResponseBody<unknown>,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    // `content-type` is written last: an error may add headers (`Retry-After`), never
    // change the envelope's media type.
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

export function jsonOk<T>(data: T, status = 200): Response {
  return json(status, { ok: true, data });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fieldErrors?: FieldErrors,
  headers?: Record<string, string>,
): Response {
  return json(
    status,
    {
      ok: false,
      error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) },
    },
    headers,
  );
}

/**
 * Wrap a route function: run it, wrap its return value in the success envelope (or
 * pass through a `Response` it built itself), and turn any thrown `AppError` into the
 * matching status + failure envelope. Unexpected errors are logged via the shared
 * logger and returned as a generic 500 — a raw stack trace never reaches the client.
 *
 * Every route handler goes through this — no route writes its own `try/catch`.
 */
export function apiHandler(logic: RouteLogic): ApiRouteHandler {
  return async (req, ctx) => {
    try {
      const result = await logic(req, ctx);
      return result instanceof Response ? result : jsonOk(result);
    } catch (error) {
      if (isAppError(error)) {
        return jsonError(
          error.status,
          error.code,
          error.message,
          error.fieldErrors,
          error.headers,
        );
      }
      logger().error({ err: error, path: req.url }, 'unhandled route error');
      return jsonError(500, 'internal_error', 'Something went wrong');
    }
  };
}

import { createLogger, type Logger } from '../logger';
import { requireCsrfHeader } from './auth';
import { type FieldErrors, isAppError } from './errors';
import { requestPath } from './safe-url';

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

export interface ApiHandlerOptions {
  /**
   * Set `false` to skip the CSRF header check. **Reserved for the payment-webhook route
   * (E04)**, which is called by Stripe rather than by a browser and authenticates by
   * verifying a request signature instead. There is no other legitimate consumer: any
   * other route reaching for this is a route that should be sending the header.
   */
  csrf?: boolean;
}

/**
 * Wrap a route function: enforce CSRF, run it, wrap its return value in the success
 * envelope (or pass through a `Response` it built itself), and turn any thrown `AppError`
 * into the matching status + failure envelope. Unexpected errors are logged via the shared
 * logger and returned as a generic 500 — a raw stack trace never reaches the client.
 *
 * Every route handler goes through this — no route writes its own `try/catch`.
 *
 * **CSRF is enforced here and nowhere else.** `requireCsrfHeader` runs before the route
 * body for every method other than `GET`, `HEAD` and `OPTIONS`, so `makeCrudRoute`'s
 * mutating verbs inherit the check and no route can forget it (primitives B3). The
 * refusal is a `ForbiddenError`, so it takes the same path to the client as any other
 * denial: 403 `forbidden`, in the standard envelope, with nothing of the route having run.
 */
export function apiHandler(
  logic: RouteLogic,
  options?: ApiHandlerOptions,
): ApiRouteHandler {
  const csrf = options?.csrf ?? true;

  return async (req, ctx) => {
    try {
      if (csrf) {
        requireCsrfHeader(req);
      }
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
      // `req.url` is the **full** URL, query string included. `/api/auth/github/callback`
      // receives the GitHub authorization `code` and the signed `state` there, and
      // `/api/auth/verify-email` receives a purpose token — logging `req.url` writes live
      // credentials into the log on any unexpected failure of those routes. pino's
      // key-based `redact` cannot see a secret embedded in a URL string, so the query is
      // dropped here, at the call site. See `safe-url.ts`.
      logger().error({ err: error, path: requestPath(req.url) }, 'unhandled route error');
      return jsonError(500, 'internal_error', 'Something went wrong');
    }
  };
}

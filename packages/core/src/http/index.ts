export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
  isAppError,
  type FieldErrors,
} from './errors';
export { safeReturnTo } from './return-to';
export {
  serializeCookie,
  readCookie,
  type CookieEnv,
  type SerializeCookieInput,
} from './cookies';
export {
  fetchJson,
  OutboundHttpError,
  DEFAULT_TIMEOUT_MS,
  type FetchJsonOptions,
} from './outbound';
export {
  apiHandler,
  jsonOk,
  jsonError,
  type ApiHandlerOptions,
  type ApiSuccess,
  type ApiFailure,
  type ApiResponseBody,
  type ApiRouteContext,
  type ApiRouteHandler,
  type RouteLogic,
} from './apiHandler';
export {
  makeCrudRoute,
  type CrudService,
  type MakeCrudRouteOptions,
} from './makeCrudRoute';
// `resolveSessionFromCookie` is deliberately absent: the scoped `session` cradle key and
// `requireSession` are the two sanctioned ways to obtain a session, so the resolver behind
// them is not part of the package's authorization surface.
export {
  requireSession,
  requireRole,
  assertOwnership,
  requireCsrfHeader,
  CSRF_HEADER,
  type Session,
  type Role,
} from './auth';

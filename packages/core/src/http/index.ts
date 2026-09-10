export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  ServiceUnavailableError,
  RATE_LIMITED_MESSAGE,
  isAppError,
  type FieldErrors,
} from './errors';
// The rate limiter (B8). The policies are exported because a route names the one it is
// enforcing; `RATE_LIMIT_SCOPES` is not a thing — the scope is a literal at the call site,
// checked against `RateLimitScope`.
export {
  RateLimiter,
  rateLimitKey,
  clientIpFromHeaders,
  SIGN_IN_IP_POLICY,
  SIGN_IN_EMAIL_POLICY,
  REGISTRATION_IP_POLICY,
  VERIFICATION_RESEND_EMAIL_POLICY,
  type RateLimitPolicy,
  type RateLimitScope,
  type RateLimitKind,
} from './rate-limit';
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
  parseJsonBody,
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

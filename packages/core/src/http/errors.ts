/**
 * Typed application error hierarchy. Services throw these; nothing else builds an
 * HTTP response. `apiHandler` maps a thrown `AppError` to the right status code and
 * the shared JSON envelope — see `apiHandler.ts`.
 */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  /**
   * Response headers the error itself requires (e.g. `Retry-After` on a rate-limit
   * refusal). `apiHandler` copies them onto the failure response; `content-type`
   * always stays `application/json`, so an error cannot change the envelope's type.
   */
  readonly headers?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code: string,
    options?: {
      fieldErrors?: FieldErrors;
      cause?: unknown;
      headers?: Record<string, string>;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    // `new.target.name` gives the concrete subclass name (e.g. `NotFoundError`).
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
    this.headers = options?.headers;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', options?: { cause?: unknown }) {
    super(message, 400, 'bad_request', options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'unauthorized');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(message, 403, 'forbidden');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'not_found');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict with the current state of the resource') {
    super(message, 409, 'conflict');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', fieldErrors?: FieldErrors) {
    super(message, 422, 'validation_failed', { fieldErrors });
  }
}

/**
 * The integration this request needed is not usable right now: a credential is unset,
 * an upstream call failed or timed out, or a bounded internal resource is saturated.
 * Always a *retryable* condition from the caller's point of view — never a way to
 * report a client mistake, and never a carrier for an upstream response body.
 *
 * One code covers all three on purpose (platform primitives B20): no caller can act
 * differently on a 502 than on a 503, and a browser-navigated route redirects to
 * `?error=unavailable` either way.
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message = 'This part of the service is temporarily unavailable. Please try again.',
    options?: { cause?: unknown; headers?: Record<string, string> },
  ) {
    super(message, 503, 'service_unavailable', options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Typed application error hierarchy. Services throw these; nothing else builds an
 * HTTP response. `apiHandler` maps a thrown `AppError` to the right status code and
 * the shared JSON envelope — see `apiHandler.ts`.
 */
export type FieldErrors = Record<string, string[]>;

/**
 * The brand `isAppError` actually tests, and the reason it does not test `instanceof`.
 *
 * **Next evaluates `@devmentor/core` more than once in one process.** A page renders in the
 * SSR/RSC module graph and a route handler runs in its own; each graph gets its own copy of
 * this module, and therefore its own `AppError` *class object*. That is normally invisible,
 * because a value never crosses — except that `getContainer()` caches the awilix container
 * on `globalThis` (so the ORM, its pool and the hashing gate are shared, and survive HMR).
 * Whichever graph builds the container first owns every service in it, so from then on a
 * `UserService` living in the SSR graph throws SSR-graph errors at a route handler that
 * compares them against its own class. `instanceof` answers `false`, `apiHandler` treats a
 * deliberate `401 unauthorized` as an unexpected failure, and a wrong password answers
 * `500 internal_error` — with the ordering of the first two requests after a boot deciding
 * whether it happens at all.
 *
 * `Symbol.for` looks the symbol up in the **cross-realm registry**, so both copies of this
 * module get the same key and the brand survives the crossing. It is the same problem
 * `entities/define.ts` solves for entity schemas with a `globalThis` singleton, in the shape
 * that suits a class: identity that does not depend on which graph did the `import`.
 *
 * The corollary is that **no code may narrow one of these by `instanceof`.** Discriminate on
 * `code` instead — it is the published contract (`BACKWARD_COMPATIBILITY.md` §1) and it is a
 * string, so it crosses too.
 */
const APP_ERROR_BRAND: unique symbol = Symbol.for('devmentor.http.app-error');

export class AppError extends Error {
  /** See `APP_ERROR_BRAND`. Present on every subclass, by construction. */
  readonly [APP_ERROR_BRAND] = true;
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  /**
   * Response headers the error itself requires (e.g. `Retry-After` on a rate-limit
   * refusal). `apiHandler` copies them onto the failure response; `content-type`
   * always stays `application/json`, so an error cannot change the envelope's type.
   */
  readonly headers?: Record<string, string>;
  /**
   * How long the caller should wait before retrying, in whole seconds. `apiHandler`
   * copies it into the failure envelope alongside `code` and `message`.
   *
   * It lives on the base class next to `fieldErrors`, for the same reason `fieldErrors`
   * does: the envelope is one shape, and a field only one subclass populates is still a
   * field of that shape. It is *duplicated* in the `Retry-After` header rather than left
   * to it, because a `fetch` caller reading `{ ok: false, error }` should not have to
   * reach for `response.headers` to render "try again in 4 minutes", and because a
   * header is easy for an intermediary to strip.
   */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    options?: {
      fieldErrors?: FieldErrors;
      cause?: unknown;
      headers?: Record<string, string>;
      retryAfterSeconds?: number;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    // `new.target.name` gives the concrete subclass name (e.g. `NotFoundError`).
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
    this.headers = options?.headers;
    this.retryAfterSeconds = options?.retryAfterSeconds;
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
 * The message every rate-limit refusal carries, whatever bucket ran out.
 *
 * **Deliberately generic, and it is a security property rather than copy.** The per-email
 * and per-IP buckets have different limits, so a message that named the bucket — or a
 * count, or "this address" — would tell an enumerator which addresses have accounts and
 * which do not, which is the same oracle the identical 401 on a wrong password and an
 * unknown address exists to close (accounts spec, edge cases 13 and 17). It also says
 * nothing about *why* the attempt was refused, so it reads the same for a user who
 * mistyped their password five times and for the attacker sharing their office IP.
 */
export const RATE_LIMITED_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.';

/**
 * The caller has spent its allowance of attempts for this window (platform primitives
 * B8). Always retryable, and `retryAfterSeconds` says when — carried both in the envelope
 * and as the standard `Retry-After` header.
 *
 * The message is not a constructor default a caller is expected to override: overriding
 * it is how the generic wording above stops being generic. The parameter exists for the
 * one legitimate case, a future bucket whose refusal is genuinely a different fact, and
 * changing it is a review question rather than a call-site decision.
 */
export class TooManyRequestsError extends AppError {
  constructor(retryAfterSeconds: number, message = RATE_LIMITED_MESSAGE) {
    super(message, 429, 'rate_limited', {
      retryAfterSeconds,
      // Seconds, the delta-seconds form of `Retry-After`, rather than an HTTP-date: a
      // date would be read against the *client's* clock, and this bound is measured
      // against the server's.
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
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

/**
 * Whether `error` is one of ours, across module graphs — see `APP_ERROR_BRAND` for why this
 * is a brand check and not `error instanceof AppError`.
 *
 * `instanceof Error` is safe to keep: built-ins come from the realm, not from a bundle, so
 * both copies of this module see the same `Error`. It is here so a plain object carrying a
 * forged brand cannot be reported as an application error with a stack it does not have.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof Error && APP_ERROR_BRAND in error;
}

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

  constructor(
    message: string,
    status: number,
    code: string,
    options?: { fieldErrors?: FieldErrors; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    // `new.target.name` gives the concrete subclass name (e.g. `NotFoundError`).
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
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

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

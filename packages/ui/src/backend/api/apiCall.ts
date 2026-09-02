import type { ApiResult, FieldErrors } from './types';

/**
 * The one sanctioned place a `fetch()` to `/api/*` happens. No component calls
 * `fetch` directly. Parses the JSON envelope defensively and returns a typed
 * `ApiResult<T>`; `apiCallOrThrow` is for call sites that prefer throwing over
 * branching on `ok`.
 */
export interface ApiCallOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

// CSRF: a custom header a plain HTML form post can't set. Combined with SameSite
// cookies this is the minimum bar for state-changing routes.
const CSRF_HEADER = 'x-devmentor-request';

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isEnvelope<T>(value: unknown): value is ApiResult<T> {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

export async function apiCall<T>(
  path: string,
  options: ApiCallOptions = {},
): Promise<ApiResult<T>> {
  const { body, headers, method, ...rest } = options;
  const init: RequestInit = {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      [CSRF_HEADER]: '1',
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...rest,
  };

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'network_error',
        message: error instanceof Error ? error.message : 'Network request failed',
      },
    };
  }

  const json = await readJsonSafe(res);
  if (isEnvelope<T>(json)) {
    return json;
  }
  return {
    ok: false,
    error: { code: 'invalid_response', message: `Unexpected response (HTTP ${res.status})` },
  };
}

/** An error carrying the server's failure envelope, thrown by `apiCallOrThrow`. */
export class ApiError extends Error {
  readonly code: string;
  readonly fieldErrors?: FieldErrors;

  constructor(error: { code: string; message: string; fieldErrors?: FieldErrors }) {
    super(error.message);
    this.name = 'ApiError';
    this.code = error.code;
    this.fieldErrors = error.fieldErrors;
  }
}

export async function apiCallOrThrow<T>(path: string, options?: ApiCallOptions): Promise<T> {
  const result = await apiCall<T>(path, options);
  if (!result.ok) {
    throw new ApiError(result.error);
  }
  return result.data;
}

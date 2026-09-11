import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, ServiceUnavailableError } from './errors';
import { DEFAULT_TIMEOUT_MS, OutboundHttpError, fetchJson } from './outbound';

const testState = vi.hoisted(() => ({
  warn: vi.fn(),
  createLogger: vi.fn(),
}));

vi.mock('../logger', () => ({
  createLogger: testState.createLogger,
}));

/** Values that must never appear in a log line, whatever the outcome. */
const SECRET_BODY = { client_secret: 'gho-secret-value', code: 'exchange-code-value' };
const SECRET_HEADER = { authorization: 'Bearer gho-access-token-value' };

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Every argument every logger call received, flattened for a substring search. */
function loggedText(): string {
  return JSON.stringify(testState.warn.mock.calls);
}

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.createLogger.mockReturnValue({ warn: testState.warn });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson happy path', () => {
  it('returns the parsed JSON body, typed by the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'ada', id: 42 }));

    const identity = await fetchJson<{ login: string; id: number }>(
      'https://api.github.com/user',
      { headers: SECRET_HEADER },
    );

    expect(identity).toEqual({ login: 'ada', id: 42 });
  });

  it('defaults to GET, asks for JSON, and sends no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ email: 'ada@devmentor.dev' }]));

    await fetchJson('https://api.github.com/user/emails');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/user/emails');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ accept: 'application/json' });
    expect(init.body).toBeUndefined();
  });

  it('passes caller headers through, including authorization', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'ada' }));

    await fetchJson('https://api.github.com/user', { headers: SECRET_HEADER });

    expect(lastInit().headers).toEqual({
      accept: 'application/json',
      authorization: SECRET_HEADER.authorization,
    });
  });

  it('serialises a POST body as JSON and sets content-type', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'gho-token' }));

    await fetchJson('https://github.com/login/oauth/access_token', {
      method: 'POST',
      body: SECRET_BODY,
    });

    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(SECRET_BODY));
    expect(init.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
    });
  });

  it('sets content-type even when the caller supplies its own headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'mail-1' }));

    await fetchJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: SECRET_HEADER,
      body: { to: 'ada@devmentor.dev', subject: 'Verify your email' },
    });

    expect(lastInit().headers).toEqual({
      accept: 'application/json',
      authorization: SECRET_HEADER.authorization,
      'content-type': 'application/json',
    });
  });

  it('always passes an abort signal, because Node fetch has no default timeout', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await fetchJson('https://api.github.com/user');

    expect(lastInit().signal).toBeInstanceOf(AbortSignal);
    expect(lastInit().signal?.aborted).toBe(false);
  });

  it('defaults the timeout to the 10 seconds B20 specifies', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });

  it('logs nothing on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'ada' }));

    await fetchJson('https://api.github.com/user', { headers: SECRET_HEADER });

    expect(testState.warn).not.toHaveBeenCalled();
    expect(testState.createLogger).not.toHaveBeenCalled();
  });
});

describe('fetchJson upstream failure', () => {
  it('throws a 503 for a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, 401));

    const error = await fetchJson('https://api.github.com/user').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).status).toBe(503);
    expect((error as AppError).code).toBe('service_unavailable');
  });

  it('carries the upstream status in the cause, not in the client-facing message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, 500));

    const error = (await fetchJson('https://api.github.com/user').catch(
      (thrown: unknown) => thrown,
    )) as ServiceUnavailableError;

    const cause = error.cause as OutboundHttpError;
    expect(cause).toBeInstanceOf(OutboundHttpError);
    expect(cause.status).toBe(500);
    expect(cause.url).toBe('https://api.github.com/user');
    expect(cause.name).toBe('OutboundHttpError');
    expect(cause.message).toBe('GET https://api.github.com/user responded with 500');
    expect(error.message).toBe(
      'This part of the service is temporarily unavailable. Please try again.',
    );
  });

  it('never reads the upstream body, so it cannot leak into the envelope', async () => {
    const response = jsonResponse({ message: 'token gho-leaked-token is invalid' }, 403);
    fetchMock.mockResolvedValue(response);

    await expect(fetchJson('https://api.github.com/user')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(response.bodyUsed).toBe(false);
  });

  it('logs the method, target and status of an upstream error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));

    await expect(
      fetchJson('https://api.github.com/user', { headers: SECRET_HEADER }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);

    expect(testState.warn).toHaveBeenCalledWith(
      {
        method: 'GET',
        url: 'https://api.github.com/user',
        reason: 'upstream error status',
        status: 503,
      },
      'outbound request failed',
    );
  });

  it('throws a 503 when the upstream answers 2xx with something that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>maintenance</html>', { status: 200 }));

    const error = (await fetchJson('https://api.github.com/user').catch(
      (thrown: unknown) => thrown,
    )) as ServiceUnavailableError;

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.cause).toBeInstanceOf(Error);
    expect(testState.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'malformed JSON response', status: 200 }),
      'outbound request failed',
    );
  });
});

describe('fetchJson transport failure', () => {
  it('throws a 503 when the connection fails, keeping the original error as the cause', async () => {
    const cause = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(cause);

    const error = (await fetchJson('https://api.github.com/user').catch(
      (thrown: unknown) => thrown,
    )) as ServiceUnavailableError;

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.cause).toBe(cause);
    expect(testState.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'network failure' }),
      'outbound request failed',
    );
  });

  it('throws a 503 when the timeout aborts a hanging upstream', async () => {
    // A GitHub that accepts the connection and then never answers — the case Node's
    // timeout-free fetch would hang on forever.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject((init.signal as AbortSignal).reason);
          });
        }),
    );

    const error = (await fetchJson('https://api.github.com/user', { timeoutMs: 5 }).catch(
      (thrown: unknown) => thrown,
    )) as ServiceUnavailableError;

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as AppError).status).toBe(503);
    expect((error.cause as Error).name).toBe('TimeoutError');
    expect(testState.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'timed out after 5ms' }),
      'outbound request failed',
    );
  });
});

describe('fetchJson redaction', () => {
  it('keeps the request body and the authorization header out of every log line', async () => {
    const call = () =>
      fetchJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: SECRET_HEADER,
        body: SECRET_BODY,
        timeoutMs: 5,
      });

    // Every failure path, one after the other.
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad_verification_code' }, 401));
    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableError);

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 200 }));
    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableError);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableError);

    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject((init.signal as AbortSignal).reason);
          });
        }),
    );
    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableError);

    expect(testState.warn).toHaveBeenCalledTimes(4);
    expect(loggedText()).not.toContain('gho-secret-value');
    expect(loggedText()).not.toContain('exchange-code-value');
    expect(loggedText()).not.toContain('gho-access-token-value');
    expect(loggedText()).not.toContain('client_secret');
    expect(loggedText()).not.toContain('authorization');
    expect(loggedText()).toContain('outbound request failed');
  });

  it('strips the query string from the logged and recorded URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    const error = (await fetchJson(
      'https://api.resend.com/emails?api_key=re-secret-in-a-query',
    ).catch((thrown: unknown) => thrown)) as ServiceUnavailableError;

    // The full URL is still what gets requested...
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.resend.com/emails?api_key=re-secret-in-a-query',
    );
    // ...but nothing observable keeps the query.
    expect((error.cause as OutboundHttpError).url).toBe('https://api.resend.com/emails');
    expect(loggedText()).not.toContain('re-secret-in-a-query');
  });

  it('creates the logger once and reuses it', async () => {
    vi.resetModules();
    const fresh = await import('./outbound');
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(fresh.fetchJson('https://api.github.com/user')).rejects.toBeInstanceOf(Error);
    await expect(fresh.fetchJson('https://api.github.com/user')).rejects.toBeInstanceOf(Error);

    expect(testState.warn).toHaveBeenCalledTimes(2);
    expect(testState.createLogger).toHaveBeenCalledTimes(1);
  });
});

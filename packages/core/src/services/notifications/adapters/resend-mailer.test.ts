import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env';
import type { Logger } from '../../../logger';
import { ServiceUnavailableError } from '../../../http/errors';
import { ResendMailerAdapter } from './resend-mailer';

/**
 * `fetch` is stubbed, not `fetchJson`: the adapter's contract is "one real HTTP request to
 * this URL, with this header and this body, and every transport failure translated by B20".
 * A stubbed `fetchJson` would assert that the adapter calls a function, which is not the
 * part that can be wrong. api.resend.com is never contacted and no mail is ever sent.
 *
 * `../../../logger` is mocked because `outbound.ts` builds its own logger at module scope;
 * without this every failure case would print a pino line to the test output — and the
 * "nothing secret reaches a log" assertions below would not be able to see that line.
 */
const testState = vi.hoisted(() => ({ outboundWarn: vi.fn() }));

vi.mock('../../../logger', () => ({
  createLogger: () => ({ warn: testState.outboundWarn }),
}));

const fetchMock = vi.fn();
const info = vi.fn();
const warn = vi.fn();
const logger = { info, warn } as unknown as Logger;

const API_KEY = 'resend-api-key-value';
const ENV = {
  MAIL_API_KEY: API_KEY,
  MAIL_FROM: 'DevMentor <hello@devmentor.example>',
} as unknown as AppEnv;

const MESSAGE = {
  to: 'ada@devmentor.dev',
  subject: 'Confirm your DevMentor email address',
  text: 'Open https://devmentor.example/api/auth/verify-email?token=live-token-value',
};

function adapter(overrides: Partial<AppEnv> = {}): ResendMailerAdapter {
  return new ResendMailerAdapter({ env: { ...ENV, ...overrides }, logger });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function accepted(payload: unknown = { id: 'resend-message-id' }): void {
  fetchMock.mockResolvedValue(jsonResponse(payload));
}

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
}

/**
 * Everything any logger was handed during the case, flattened for a substring search. The
 * raw text is what proves a secret is absent from the line *anywhere*, including inside a
 * stringified nested value or an interpolated message.
 */
function loggedText(): string {
  return JSON.stringify([
    ...info.mock.calls,
    ...warn.mock.calls,
    ...testState.outboundWarn.mock.calls,
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResendMailerAdapter.send', () => {
  it('posts the message to Resend with the bearer key', async () => {
    accepted();

    await expect(adapter().send(MESSAGE)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    });
    // `to` becomes a one-element array here and nowhere else: the port carries a single
    // address, Resend's payload wants a list.
    expect(JSON.parse(init.body as string)).toEqual({
      from: ENV.MAIL_FROM,
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it('sends exactly one request — no SMTP handshake, no SDK round trips', async () => {
    accepted();

    await adapter().send(MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the 10 s abort signal Node fetch does not supply', async () => {
    // The timeout is B20's, not this adapter's, but a hung provider holding a request scope
    // open is this adapter's failure mode — so assert the signal actually rides the call.
    accepted();

    await adapter().send(MESSAGE);

    expect(lastInit().signal).toBeInstanceOf(AbortSignal);
  });

  it('logs the recipient and the provider message id', async () => {
    accepted({ id: 'resend-message-id' });

    await adapter().send(MESSAGE);

    expect(info).toHaveBeenCalledWith(
      { to: MESSAGE.to, messageId: 'resend-message-id' },
      'mail.accepted',
    );
  });

  it('never lets the API key, the subject or the body reach a log line', async () => {
    accepted();

    await adapter().send(MESSAGE);

    const logged = loggedText();
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain(MESSAGE.subject);
    expect(logged).not.toContain(MESSAGE.text);
    // The token inside the body is the thing that matters: it is in a URL, and pino's
    // `redact` matches key *names*, so a query parameter is past it by construction
    // (2026-09-10 in `.ai/lessons.md`). Nothing may log the body at all.
    expect(logged).not.toContain('live-token-value');
  });

  it('accepts a 2xx whose payload it does not recognise, rather than failing a sent message', async () => {
    // Resend already queued it. Refusing here because a field was renamed would fail a
    // registration whose mail is on its way and send the user round to trigger a duplicate.
    accepted({ unexpected: true });

    await expect(adapter().send(MESSAGE)).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith({ to: MESSAGE.to, messageId: null }, 'mail.accepted');
  });

  it('accepts a 2xx with an empty id the same way', async () => {
    accepted({ id: '' });

    await expect(adapter().send(MESSAGE)).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith({ to: MESSAGE.to, messageId: null }, 'mail.accepted');
  });
});

describe('ResendMailerAdapter when delivery fails', () => {
  it('fails closed with a 503 when Resend answers a non-2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Invalid `to` field' }, 422));

    const error = await adapter()
      .send(MESSAGE)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({ status: 503, code: 'service_unavailable' });
    // Nothing was swallowed: registration cannot report success for a link that was never
    // sent (edge case 29).
    expect(info).not.toHaveBeenCalled();
  });

  it('does not leak the upstream status or body to the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Domain not verified' }, 403));

    const error = (await adapter()
      .send(MESSAGE)
      .catch((thrown: unknown) => thrown)) as ServiceUnavailableError;

    expect(error.message).not.toContain('403');
    expect(error.message).not.toContain('Domain not verified');
  });

  it('fails closed with a 503 when the request times out', async () => {
    // `AbortSignal.timeout`'s own reason, which is what `fetchJson` sees for a hung
    // provider. The abort itself is covered end to end in `outbound.test.ts`.
    fetchMock.mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    await expect(adapter().send(MESSAGE)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(info).not.toHaveBeenCalled();
  });

  it('fails closed with a 503 when the connection drops', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(adapter().send(MESSAGE)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('keeps the key and the body out of the logs on every failure path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 500));

    await adapter()
      .send(MESSAGE)
      .catch(() => undefined);

    // `fetchJson` logged the failure; assert what it logged rather than assuming it stayed
    // quiet, because that line is the one most likely to grow a body "for debugging".
    expect(testState.outboundWarn).toHaveBeenCalled();
    const logged = loggedText();
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain(MESSAGE.text);
    expect(logged).not.toContain('live-token-value');
  });
});

describe('ResendMailerAdapter when mail is not configured', () => {
  it('refuses with a 503 naming both variables when the API key is unset', async () => {
    const error = await adapter({ MAIL_API_KEY: undefined })
      .send(MESSAGE)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as Error).message).toContain('MAIL_API_KEY');
    expect((error as Error).message).toContain('MAIL_FROM');
    // B6: the check is at the point of use, so the process still boots, builds and serves
    // every page that does not send mail.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses the same way when the sender address is unset', async () => {
    // Resend rejects a send with no `from`; defaulting it would turn a configuration
    // mistake into an upstream 422 that reads like an outage.
    await expect(
      adapter({ MAIL_FROM: undefined }).send(MESSAGE),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says nothing about it in the log, and certainly not the key', async () => {
    await adapter({ MAIL_FROM: '' })
      .send(MESSAGE)
      .catch(() => undefined);

    expect(loggedText()).not.toContain(API_KEY);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

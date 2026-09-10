import { describe, expect, it, vi } from 'vitest';
import { createLoggerTo, type Logger } from '../../../logger';
import { LogMailerAdapter, MAIL_SENT_MESSAGE } from './log-mailer';

/**
 * This adapter is tested through a **real pino logger** rather than a spy, because its
 * contract is not "calls `logger.info`" — it is "puts a line on stdout that
 * `waitForMail` in `tests/integration/mail.ts` can `JSON.parse` and read four fields
 * out of". A mock would pass while the emitted record was unparseable, and the only
 * symptom would be an integration scenario timing out ten seconds later.
 *
 * `createLoggerTo` is the sanctioned seam for this. It is deliberately a separate function
 * from `createLogger`, which must stay zero-arity because awilix's PROXY mode hands every
 * `asFunction` factory the cradle as its first argument (2026-09-10 in `.ai/lessons.md`).
 */
function capture(): { lines: string[]; write(chunk: string): void } {
  const lines: string[] = [];
  return {
    lines,
    write(chunk: string) {
      lines.push(chunk);
    },
  };
}

const MESSAGE = {
  to: 'ada@devmentor.dev',
  subject: 'Confirm your DevMentor email address',
  text: 'Open https://devmentor.example/api/auth/verify-email?token=live-token-value',
};

/** Send one message through a real logger and hand back what landed on the stream. */
async function sentRecords(
  ...messages: { to: string; subject: string; text: string }[]
): Promise<{ raw: string[]; parsed: Record<string, unknown>[] }> {
  const destination = capture();
  const mailer = new LogMailerAdapter({ logger: createLoggerTo(destination) });

  for (const message of messages) {
    await mailer.send(message);
  }

  return {
    raw: destination.lines,
    parsed: destination.lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('LogMailerAdapter', () => {
  it('emits exactly one structured line per message', async () => {
    const { raw } = await sentRecords(MESSAGE, { ...MESSAGE, subject: 'Second' });

    expect(raw).toHaveLength(2);
    // One record per `write`, each a complete JSON line — which is what lets the reader
    // drop a partially written trailing segment and parse everything before it.
    for (const line of raw) {
      expect(line.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
  });

  it('carries the msg and the three fields waitForMail reads', async () => {
    const { parsed } = await sentRecords(MESSAGE);

    expect(parsed[0]).toMatchObject({
      msg: MAIL_SENT_MESSAGE,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it('names the message `mail.sent`, which the harness matches on', async () => {
    // A magic string shared across a package boundary. If this changes, `waitForMail` stops
    // matching and every mail-dependent scenario times out instead of failing usefully.
    expect(MAIL_SENT_MESSAGE).toBe('mail.sent');
  });

  it('logs at info, so the default LOG_LEVEL emits it', async () => {
    // `LOG_LEVEL` defaults to `info`. At `debug` the record would be silently dropped and
    // the capture would be empty with nothing to explain why.
    const { parsed } = await sentRecords(MESSAGE);

    expect(parsed[0]?.level).toBe(30);
  });

  it('writes the body verbatim, token and all', async () => {
    // **This is the whole point of the adapter, and it is the reason it is only ever
    // selected by `MAILER_ADAPTER=log` + `INTEGRATION_TEST_RUN=1` or by `development`.**
    // pino's `redact` cannot censor a token inside a URL — it matches key names — so this
    // line really does contain a live credential. The safety is in the selection rule, not
    // in the adapter.
    const { raw } = await sentRecords(MESSAGE);

    expect(raw[0]).toContain('live-token-value');
  });

  it('resolves rather than reporting a failure, because the log is the delivery', async () => {
    const logger = { info: vi.fn() } as unknown as Logger;

    await expect(new LogMailerAdapter({ logger }).send(MESSAGE)).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      { to: MESSAGE.to, subject: MESSAGE.subject, text: MESSAGE.text },
      MAIL_SENT_MESSAGE,
    );
  });
});

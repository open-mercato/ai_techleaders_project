import { mkdtemp, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAIL_SENT_MESSAGE } from '@devmentor/core';
import { appLogPath, waitForMail } from './mail';

/**
 * A unit test for a piece of the **integration harness**, run by the unit suite.
 *
 * `waitForMail` cannot be proven by the suite it serves: a broken parser there shows up as
 * a scenario that waits out its timeout, in a job that needs Docker, a Postgres container
 * and a browser runtime before it can say so. Everything it does — parse a pino line,
 * ignore the framework's own output, survive a half-written flush, give up cleanly — is
 * decidable against a real temp file with none of that, so it is decided here.
 *
 * Real files, not a mocked `fs`: the behaviours under test are "the file does not exist
 * yet" and "the last line is still being written", which a mock would only ever confirm
 * about itself.
 */

const TO = 'ada@devmentor.dev';
const TEXT = 'Open https://devmentor.example/api/auth/verify-email?token=live-token-value';

let directory: string;
let logPath: string;

/** A line in the shape `LogMailerAdapter` emits — pino's, with `msg` last. */
function mailLine(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    level: 30,
    time: Date.now(),
    app: 'DevMentor',
    to: TO,
    subject: 'Confirm your DevMentor email address',
    text: TEXT,
    msg: MAIL_SENT_MESSAGE,
    ...overrides,
  })}\n`;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'devmentor-mail-'));
  logPath = join(directory, 'app.log');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('appLogPath', () => {
  it('is the file global-setup pipes the app into', () => {
    // One definition, two users. If these ever diverge the writer and the reader are on
    // different files and every mail scenario times out with nothing to explain it.
    expect(appLogPath).toBe(resolve('test-results/integration/app.log'));
  });
});

describe('waitForMail', () => {
  it('parses a captured line into the message', async () => {
    await writeFile(logPath, mailLine());

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).resolves.toEqual({
      to: TO,
      subject: 'Confirm your DevMentor email address',
      text: TEXT,
    });
  });

  it('ignores every line that is not a mail capture', async () => {
    // All four are real neighbours in that file: Next's startup banner, a plain stderr
    // line, another pino record from this app, and a message to somebody else.
    await writeFile(
      logPath,
      [
        '  ▲ Next.js 16.0.0\n',
        '   - Local:  http://127.0.0.1:41234\n',
        `${JSON.stringify({ level: 30, msg: 'auth.user.created', userId: 'user-1' })}\n`,
        mailLine({ to: 'someone-else@devmentor.dev', text: 'not this one' }),
        mailLine(),
      ].join(''),
    );

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).resolves.toMatchObject({
      text: TEXT,
    });
  });

  it('ignores a JSON line that is not an object', async () => {
    await writeFile(logPath, `null\n42\n"a string"\n${mailLine()}`);

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).resolves.toMatchObject({
      to: TO,
    });
  });

  it('skips a capture missing the fields it promises', async () => {
    // Not reachable from `LogMailerAdapter`, which always sends all three — but a
    // half-built message returned here would fail an assertion somewhere unrelated, so the
    // line is skipped and the wait continues.
    await writeFile(logPath, mailLine({ text: undefined }) + mailLine({ subject: 42 }));

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).rejects.toThrow(/Timed out/);
  });

  it('returns the newest match when several messages went to the same address', async () => {
    // The log accumulates for the whole run, so an earlier message to this address is by
    // definition the stale one — its link may already have been consumed.
    await writeFile(
      logPath,
      mailLine({ text: 'first link' }) + mailLine({ text: 'second link' }),
    );

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).resolves.toMatchObject({
      text: 'second link',
    });
  });

  it('waits for the next message when minCount says one already exists', async () => {
    await writeFile(logPath, mailLine({ text: 'first link' }));
    const pending = waitForMail(TO, { logPath, minCount: 2, timeoutMs: 2_000, pollIntervalMs: 5 });

    setTimeout(() => void appendFile(logPath, mailLine({ text: 'second link' })), 30);

    await expect(pending).resolves.toMatchObject({ text: 'second link' });
  });

  it('ignores a line the app is still writing', async () => {
    // The file is appended to while this reads it, so a poll can land mid-flush. The
    // trailing segment is always dropped; a complete line reappears on the next poll.
    await writeFile(logPath, `${mailLine()}{"level":30,"to":"ada@devmentor.d`);

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).resolves.toMatchObject({
      text: TEXT,
    });
  });

  it('does not crash on a half-written capture with nothing complete behind it', async () => {
    await writeFile(logPath, '{"level":30,"to":"ada@devmentor.dev","subj');

    await expect(waitForMail(TO, { logPath, timeoutMs: 0 })).rejects.toThrow(/Timed out/);
  });

  it('finishes a partial line once the rest of it lands', async () => {
    const line = mailLine({ text: 'second link' });
    await writeFile(logPath, line.slice(0, 20));
    const pending = waitForMail(TO, { logPath, timeoutMs: 2_000, pollIntervalMs: 5 });

    setTimeout(() => void appendFile(logPath, line.slice(20)), 30);

    await expect(pending).resolves.toMatchObject({ text: 'second link' });
  });

  it('treats a log file that does not exist yet as nothing logged', async () => {
    const pending = waitForMail(TO, { logPath, timeoutMs: 2_000, pollIntervalMs: 5 });

    setTimeout(() => void writeFile(logPath, mailLine()), 30);

    await expect(pending).resolves.toMatchObject({ to: TO });
  });

  it('rethrows a read failure that is not a missing file', async () => {
    // Swallowing this would blame the mail for what is actually a broken path — the wait
    // would run its full timeout and report "0 found".
    await expect(
      waitForMail(TO, { logPath: directory, timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('times out cleanly instead of hanging, naming the address and the file', async () => {
    await writeFile(logPath, '');
    const started = Date.now();

    const error = (await waitForMail(TO, {
      logPath,
      timeoutMs: 60,
      pollIntervalMs: 5,
    }).catch((thrown: unknown) => thrown)) as Error;

    expect(error.message).toContain(TO);
    expect(error.message).toContain(logPath);
    expect(error.message).toContain('0 found');
    // A helper that waits forever is worse than one that fails: the whole point is that
    // this returns control rather than dying on the suite timeout with no message.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('reports how many it did find when minCount is not reached', async () => {
    await writeFile(logPath, mailLine());

    await expect(
      waitForMail(TO, { logPath, minCount: 3, timeoutMs: 20, pollIntervalMs: 5 }),
    ).rejects.toThrow(/1 found/);
  });

  it('never writes to the log it polls', async () => {
    const content = mailLine();
    await writeFile(logPath, content);

    await waitForMail(TO, { logPath, timeoutMs: 0 });

    await expect(readFile(logPath, 'utf8')).resolves.toBe(content);
  });
});

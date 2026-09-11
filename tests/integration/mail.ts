import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAIL_SENT_MESSAGE } from '@devmentor/core';
import { integrationArtifactsDirectory } from './agent-browser';

/**
 * Reading the mail the app sent, without a mailbox.
 *
 * The harness runs the app with `MAILER_ADAPTER=log` + `INTEGRATION_TEST_RUN=1`, so
 * `LogMailerAdapter` writes one structured pino line per message — `msg: 'mail.sent'` with
 * `to`, `subject` and `text` — to stdout, and `global-setup.ts` pipes stdout into
 * `appLogPath`. `waitForMail(to)` polls that file and parses the line back out, which is
 * what lets a registration scenario follow the **real** verification link end to end.
 *
 * Deliberately not built any other way. A second "capture" adapter would be a second thing
 * to keep in step with the real one, and a test endpoint that hands out the current token
 * would skip delivery entirely — which is precisely the fail-closed behaviour (edge case
 * 29) the scenario exists to prove.
 */

/**
 * The file `global-setup.ts` pipes the app's stdout and stderr into. Defined here rather
 * than there so the writer and the reader cannot drift onto two different paths — a drift
 * whose only symptom would be a scenario that waits out its timeout for mail that was sent.
 */
export const appLogPath = resolve(integrationArtifactsDirectory, 'app.log');

/** One captured message, exactly the fields `LogMailerAdapter` emits. */
export interface CapturedMail {
  to: string;
  subject: string;
  text: string;
}

export interface WaitForMailOptions {
  /** The log file to poll. Overridable so this helper is unit-testable against a fixture. */
  logPath?: string;
  /**
   * How long to keep polling before giving up. **A helper that waits forever is worse than
   * one that fails**: the failure is a 10 s test, whereas a bare `while` loop is a CI job
   * that dies on the suite timeout with no message about which mail never arrived.
   */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /**
   * How many messages to `to` must exist before the newest one is returned. Default 1.
   *
   * The reason this exists: the log is append-only for the whole run, so a scenario that
   * triggers a *second* message to an address that already received one would otherwise
   * match the first line instantly and assert against a stale link. `minCount: 2` makes
   * "wait for the next one" expressible instead of hoping the poll loses the race.
   */
  minCount?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 50;

/**
 * Parse one log line into a captured message, or `undefined` if it is not one.
 *
 * Most lines are not: Next's own startup banner, request logs, and this app's other pino
 * records all share the file. A line that does not parse as JSON is skipped rather than
 * raised — the alternative is a helper that fails on whatever the framework decides to
 * print next.
 */
function parseCapturedMail(line: string, to: string): CapturedMail | undefined {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (typeof record !== 'object' || record === null) {
    return undefined;
  }

  const { msg, to: recipient, subject, text } = record as Record<string, unknown>;
  if (msg !== MAIL_SENT_MESSAGE || recipient !== to) {
    return undefined;
  }
  // A `mail.sent` line missing either field is a capture this helper cannot honour, so it
  // is skipped and the wait continues rather than returning a half-built message that would
  // fail an assertion somewhere unrelated.
  if (typeof subject !== 'string' || typeof text !== 'string') {
    return undefined;
  }
  return { to, subject, text };
}

/**
 * Every message to `to` in `content`, oldest first.
 *
 * **The last segment is always dropped.** `content.split('\n')` ends with either the empty
 * string after a trailing newline or a line the app is *still writing* — the file is being
 * appended to while this reads it, so a poll can easily catch `{"level":30,"to":"ada@dev`
 * mid-flush. Dropping it costs nothing (a complete line reappears on the next poll) and
 * removes the whole class of "sometimes the JSON is truncated" flake.
 */
function capturedMailIn(content: string, to: string): CapturedMail[] {
  const lines = content.split('\n');
  lines.pop();
  return lines.flatMap((line) => parseCapturedMail(line, to) ?? []);
}

async function readLog(logPath: string): Promise<string> {
  try {
    return await readFile(logPath, 'utf8');
  } catch (error) {
    // Absent is "nothing logged yet", not a failure: a poll may start before the app has
    // flushed its first byte. Anything else — a permission problem, a directory — is a real
    // fault and must not be swallowed into a timeout that blames the mail.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/**
 * Wait for a message addressed to `to` and return it parsed.
 *
 * Returns the **newest** match: the log accumulates for the whole run, so an older message
 * to the same address is by definition the stale one. Use `minCount` when the scenario
 * deliberately triggers a second message to an address that already has one.
 */
export async function waitForMail(
  to: string,
  options: WaitForMailOptions = {},
): Promise<CapturedMail> {
  const {
    logPath = appLogPath,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    minCount = 1,
  } = options;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const matches = capturedMailIn(await readLog(logPath), to);
    const latest = matches.at(-1);
    if (latest !== undefined && matches.length >= minCount) {
      return latest;
    }

    // Checked *after* a read, so `timeoutMs: 0` still means "look once" rather than "never
    // look", and the last read of a real wait happens at the deadline rather than one poll
    // interval before it.
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${minCount} message(s) to ${to}: ` +
          `${matches.length} found in ${logPath}. If the app is running with the real ` +
          'mailer, set MAILER_ADAPTER=log and INTEGRATION_TEST_RUN=1 for the run.',
      );
    }

    await delay(pollIntervalMs);
  }
}

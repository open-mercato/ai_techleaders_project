import type { Logger } from '../../../logger';
import type { Mailer, MailMessage } from '../mailer.port';

/**
 * The mailer that delivers nothing and writes the message to the application log instead
 * (platform primitives B14).
 *
 * Two jobs, and it is the only thing that can do either.
 *
 * 1. **`npm run dev` works with no mail account.** Registration has to fail closed when the
 *    verification link cannot be delivered (edge case 29), so a development process with no
 *    `MAIL_API_KEY` and the real adapter registered would show a form that always 503s. The
 *    container registers this one automatically in `development` when `MAILER_ADAPTER` is
 *    unset, with a boot warning, and the link is in the terminal the dev server is already
 *    printing to.
 * 2. **The harness reads the real link.** One structured line per message —
 *    `msg: 'mail.sent'` with `to`, `subject` and `text` — is what `waitForMail(to)` in
 *    `tests/integration/mail.ts` polls the piped app log for, so the registration scenario
 *    follows the actual link end to end. No second capture adapter, no HTTP endpoint that
 *    hands out tokens, and above all no test that signs its own token to skip the mail —
 *    that would bypass exactly the fail-closed behaviour it is meant to prove.
 *
 * **It logs the body, and that is safe only because of how it is selected.** `text` carries
 * a live signed token in a URL, which pino's `redact` cannot reach (it matches key *names*,
 * and a query parameter is not a key — 2026-09-10 in `.ai/lessons.md`). Writing it out is
 * the entire point of this class, so the safety lives one level up: the container selects it
 * only for `MAILER_ADAPTER=log` **and** `INTEGRATION_TEST_RUN=1`, or in `development` where
 * the "leak" is the developer's own terminal, and `config/env.ts` refuses to parse the first
 * flag without the second so a production deployment cannot reach this class at all
 * (edge case 30). Nothing here checks those flags, and nothing here should: a fake that
 * decides for itself whether it is allowed to run is a fake that can be wrong about it.
 *
 * `info`, not `debug`: `LOG_LEVEL` defaults to `info`, and a capture that silently emits
 * nothing under the default configuration would make `waitForMail` time out with no clue
 * why.
 */

/**
 * The `msg` every captured line carries. Exported because `waitForMail` matches on it and
 * two hand-written copies of a magic string would drift into a test that hangs for 10
 * seconds and then reports "no mail" about mail that was sent.
 */
export const MAIL_SENT_MESSAGE = 'mail.sent';

export class LogMailerAdapter implements Mailer {
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  async send({ to, subject, text }: MailMessage): Promise<void> {
    // One call, one line, three fields — flat rather than nested under `mail`, so a reader
    // (`waitForMail`, `grep`, a log viewer) needs no path into the record. Resolving means
    // "delivered" for this adapter, which is true: the log *is* the delivery.
    this.logger.info({ to, subject, text }, MAIL_SENT_MESSAGE);
  }
}

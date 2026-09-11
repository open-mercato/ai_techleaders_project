import { z } from 'zod';
import type { AppEnv } from '../../../config/env';
import type { Logger } from '../../../logger';
import { ServiceUnavailableError } from '../../../http/errors';
import { fetchJson } from '../../../http/outbound';
import type { Mailer, MailMessage } from '../mailer.port';

/**
 * The real mailer (platform primitives B14).
 *
 * **No SMTP client, no SDK, one `fetchJson` call.** Raw SMTP would need `nodemailer` and a
 * connection pool; `resend`'s own SDK would add a dependency tree, its own retry policy and
 * its own timeout defaults to wrap the single `POST /emails` this file spells out in full.
 * The adapter is named after the provider because the JSON shape below is Resend's, not a
 * portable one — swapping providers means a second adapter, not an abstraction here.
 *
 * `fetchJson` (B20) owns everything about the transport: the 10 s `AbortSignal.timeout` that
 * keeps a hung provider from holding a request scope open, the single retryable 503 for any
 * non-2xx that never carries the upstream's status or body to the client, and the guarantee
 * that no request body or header — which here means the API key *and* the message text —
 * can reach a log line. This adapter adds only what `fetchJson` cannot know: the payload
 * shape, and which outcomes are refusals rather than outages.
 *
 * **What this adapter logs, and what it must never log.** One `info` line per accepted
 * message, carrying the recipient and the provider's message id — enough to answer "did we
 * send it, and what does Resend call it" from production logs. `MAIL_API_KEY` appears
 * nowhere, in any branch: not in the success line, not in a failure line, not in an error
 * message. Neither does `subject` or `text`; the body carries a live verification token
 * inside a URL, and a token inside a URL is past pino's `redact`, which matches key names
 * (2026-09-10 in `.ai/lessons.md`). `LogMailerAdapter` is the deliberate opposite of this
 * and is only ever selected inside an integration run.
 */

/** Resend's transactional send endpoint. A constant here, not configuration (B14). */
const ENDPOINT = 'https://api.resend.com/emails';

/**
 * B6: *missing* configuration fails at the point of use, not at boot — an unset
 * `MAIL_API_KEY` must not take the marketing site down in development. Production is the
 * exception, and it is checked once at container creation (`assertProductionSecrets`), so
 * a deployment cannot boot green and then 503 every registration until somebody notices.
 *
 * `MAIL_FROM` is required here for the same reason `MAIL_API_KEY` is: Resend rejects a send
 * without a `from`, so an adapter that defaulted it would turn a configuration mistake into
 * an upstream 422. The message names both variables and quotes neither value.
 */
const NOT_CONFIGURED_MESSAGE =
  'Email delivery is not configured. Set MAIL_API_KEY to the Resend API key and MAIL_FROM ' +
  'to the verified sender address.';

/**
 * The only field this adapter reads back, and it is parsed *softly* — a mismatch logs
 * `messageId: null` instead of throwing. **On purpose:** `fetchJson` only returns here for a
 * 2xx, and a 2xx from Resend *is* the acceptance. Refusing a message the provider has
 * already queued — because a future payload renamed a field this adapter merely logs —
 * would fail a registration whose mail is on its way and send the user round again to
 * trigger a duplicate. The id is observability; the status code is the success signal.
 */
const acceptedSchema = z.object({ id: z.string().min(1) });

export class ResendMailerAdapter implements Mailer {
  private readonly env: AppEnv;
  private readonly logger: Logger;

  constructor({ env, logger }: { env: AppEnv; logger: Logger }) {
    this.env = env;
    this.logger = logger;
  }

  async send({ to, subject, text }: MailMessage): Promise<void> {
    const { apiKey, from } = this.credentials();

    const payload = await fetchJson<unknown>(ENDPOINT, {
      method: 'POST',
      // The key rides an `authorization` header rather than the body, so `logger.ts`'s
      // redaction is a second line of defence over `fetchJson` never logging headers at all.
      headers: { authorization: `Bearer ${apiKey}` },
      // `to` is an array because that is Resend's shape; the port takes one address, so
      // this is the only place a single recipient becomes a one-element list.
      body: { from, to: [to], subject, text },
    });

    // No `try/catch` anywhere in this method, and that is the fail-closed contract (edge
    // case 29): every `fetchJson` failure — non-2xx, timeout, DNS, malformed JSON — is
    // already a `ServiceUnavailableError`, and swallowing one here would let registration
    // report success for a verification link that was never sent.
    const accepted = acceptedSchema.safeParse(payload);
    this.logger.info(
      { to, messageId: accepted.success ? accepted.data.id : null },
      'mail.accepted',
    );
  }

  /**
   * The credentials, or a 503 naming what is unset. Read per send rather than in the
   * constructor so the container can register this adapter unconditionally — a process with
   * no mail configured still boots, builds and serves every page that does not send mail.
   */
  private credentials(): { apiKey: string; from: string } {
    const { MAIL_API_KEY: apiKey, MAIL_FROM: from } = this.env;
    if (!apiKey || !from) {
      // Deliberately not logged: an operator reading a 503 from the route knows more than a
      // log line would say, and the failure is a configuration state, not an event.
      throw new ServiceUnavailableError(NOT_CONFIGURED_MESSAGE);
    }
    return { apiKey, from };
  }
}

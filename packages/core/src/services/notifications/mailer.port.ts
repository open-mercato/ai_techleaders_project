/**
 * The seam between DevMentor and whatever actually delivers an email (platform
 * primitives B14).
 *
 * One method. Everything the product sends today — the verification link (#13), and the
 * booking, message and review notifications queued behind it (#15, #23, #27, #30) — is a
 * plain-text message to one address, so the port carries exactly that and nothing an
 * adapter would have to invent: no HTML alternative, no attachments, no template id, no
 * per-provider options bag. Growing it later is a change to one interface and two files;
 * shipping fields no caller sets would be a contract nobody can remove.
 *
 * **The port fixes the shape of the seam, not its selection.** Which adapter is registered
 * is configuration (`MAILER_ADAPTER=log` *and* `INTEGRATION_TEST_RUN=1`, enforced in
 * `container.ts` and refused at parse time by `config/env.ts`), because the integration
 * harness builds and runs the app as a child process and so cannot compose the container
 * in-process. Same rule as the GitHub identity seam — see "Selecting the identity adapter"
 * in `.ai/specs/2026-09-04-accounts-and-roles.md`.
 *
 * **`send` resolves only when the message was accepted for delivery, and rejects
 * otherwise.** That is the whole reason it returns a promise rather than being
 * fire-and-forget: registration must fail closed when the verification mail could not be
 * sent, rather than reporting success for an account nobody can ever confirm (edge case
 * 29). A caller that genuinely wants best-effort delivery — B15's notification fan-out,
 * where the durable record is the in-product row — catches the rejection itself, which is
 * a decision the caller can make and the port cannot.
 */

/**
 * One outbound message.
 *
 * `to` is a single address on purpose: every send in this product is addressed to one
 * person, and a `string[]` would put two recipients on one envelope where the caller
 * almost always means two separate messages.
 */
export interface MailMessage {
  to: string;
  subject: string;
  /**
   * The plain-text body. **Treat it as secret.** Verification and password-reset bodies
   * carry a signed, live token in a URL — and a token inside a URL is invisible to pino's
   * `redact`, which matches key *names* (see the 2026-09-10 entry in `.ai/lessons.md`).
   * The Resend adapter therefore never logs it. `LogMailerAdapter` does, which is its
   * entire purpose and is why it is only ever reachable in an integration run.
   */
  text: string;
}

export interface Mailer {
  /**
   * Deliver `message`, or reject.
   *
   * Rejects with `ServiceUnavailableError` for an unconfigured or failing provider, so
   * the caller needs no provider-specific error handling and the client sees one
   * retryable 503 whatever the upstream said.
   */
  send(message: MailMessage): Promise<void>;
}

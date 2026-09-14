import { apiHandler, isAppError, withRequestScope } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/** The header the payment provider signs its delivery with. */
export const SIGNATURE_HEADER = 'stripe-signature';

/**
 * The payment provider's callback (#22, #34).
 *
 * **This is the one route in the product that does not answer the `{ ok, data }` envelope**,
 * and the only legitimate user of `apiHandler(logic, { csrf: false })`. Both exceptions have
 * the same cause: the caller is Stripe, not a browser. It cannot send the CSRF header, it
 * authenticates by signing the request body instead, and it reads a bare status code. A
 * JSON envelope here would be a body nothing parses.
 * `BACKWARD_COMPATIBILITY.md` §1 records the exception next to `/api/health`.
 *
 * The body is read **raw** — `req.text()`, before anything parses it — because the
 * signature covers the exact bytes sent. Re-serialising a parsed object would produce
 * different bytes and a signature that never verifies.
 *
 * Answering is deliberate about which failures invite a redelivery. A body that does not
 * verify gets **400**: it is not evidence of anything, and a 5xx would have the provider
 * resend a forgery forever. A delivery that verifies but cannot be acted on yet — a
 * database that is down — throws, becomes a 500, and *should* be redelivered.
 */
export const POST = apiHandler(
  (req) =>
    withRequestScope(req, async ({ paymentGateway, paymentService, logger }) => {
      const rawBody = await req.text();
      const signature = req.headers.get(SIGNATURE_HEADER);

      let event;
      try {
        event = paymentGateway.parseWebhookEvent(rawBody, signature);
      } catch (error) {
        // Never the message: a verification failure's text can restate what was sent.
        logger.warn(
          { code: isAppError(error) ? error.code : 'unknown' },
          'payment webhook refused',
        );
        return new Response('signature verification failed', { status: 400 });
      }

      const outcome = await paymentService.handleWebhookEvent(event);
      logger.info({ eventId: event.id, type: event.type, outcome }, 'payment webhook handled');
      return new Response(outcome, { status: 200 });
    }),
  // The documented single exception — see the note above.
  { csrf: false },
);

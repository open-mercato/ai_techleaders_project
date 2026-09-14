import Stripe from 'stripe';
import type { AppEnv } from '../../../config/env';
import type { Logger } from '../../../logger';
import { BadRequestError, ServiceUnavailableError } from '../../../http/errors';
import type {
  CheckoutSession,
  CheckoutSessionRequest,
  GatewayEvent,
  PaymentGateway,
  Refund,
  RefundRequest,
  Transfer,
  TransferRequest,
} from '../payment-gateway.port';

export const STRIPE_UNAVAILABLE_MESSAGE =
  'Payments are temporarily unavailable. Please try again.';

/** What a caller sees when a key this route needs was never configured. */
function missingKey(name: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'): ServiceUnavailableError {
  return new ServiceUnavailableError(
    `${name} is not configured, so this deployment cannot take payments. `
    + STRIPE_UNAVAILABLE_MESSAGE,
  );
}

/**
 * The one module that imports the Stripe SDK (E03-S03-T01 / #34).
 *
 * **It fails closed at the point of use, not at boot.** `STRIPE_SECRET_KEY` is optional in
 * the environment schema (B6) so a deployment without it still builds, boots and serves
 * every page; what it cannot do is start a Checkout. That is a 503 from this adapter rather
 * than a process that refuses to start.
 *
 * Every Stripe failure is mapped to a typed `AppError` here, so no `StripeError` ever
 * reaches a route: the envelope mapper would turn an unrecognised throw into a generic 500,
 * and a caller cannot act on that.
 */
export class StripePaymentGateway implements PaymentGateway {
  private readonly env: AppEnv;
  private readonly logger: Logger;
  private client: Stripe | undefined;

  constructor({ env, logger }: { env: AppEnv; logger: Logger }) {
    this.env = env;
    this.logger = logger;
  }

  /** Built on first use, so an unconfigured deployment pays nothing for this adapter. */
  private stripe(): Stripe {
    if (this.env.STRIPE_SECRET_KEY === undefined) throw missingKey('STRIPE_SECRET_KEY');
    this.client ??= new Stripe(this.env.STRIPE_SECRET_KEY);
    return this.client;
  }

  private unavailable(operation: string, error: unknown): never {
    // Ids and the operation, never the request body — a payment body carries amounts and
    // customer detail that has no business in a log line.
    this.logger.error({ err: error, operation }, 'stripe request failed');
    throw new ServiceUnavailableError(STRIPE_UNAVAILABLE_MESSAGE);
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession> {
    const stripe = this.stripe();
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        // Seconds since the epoch, and the same instant as the booking's own hold, so the
        // two cannot disagree about who owns the slot.
        expires_at: Math.floor(request.expiresAt.getTime() / 1000),
        client_reference_id: request.bookingId,
        metadata: { bookingId: request.bookingId },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: request.amountCents,
            product_data: { name: request.description },
          },
        }],
      });
      if (session.url === null) {
        // Stripe returns a null url for a session that cannot be paid in a browser. There
        // is nowhere to send the mentee, so this is a failure, not a session.
        this.unavailable('checkout.sessions.create', new Error('session has no url'));
      }
      return { id: session.id, url: session.url };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) throw error;
      this.unavailable('checkout.sessions.create', error);
    }
  }

  async refund(request: RefundRequest): Promise<Refund> {
    const stripe = this.stripe();
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: request.paymentIntentId, amount: request.amountCents },
        // The booking id, so a retried refund is the same refund rather than a second one.
        { idempotencyKey: `refund-${request.idempotencyKey}` },
      );
      return { id: refund.id, status: refundStatus(refund.status) };
    } catch (error) {
      this.unavailable('refunds.create', error);
    }
  }

  async transfer(request: TransferRequest): Promise<Transfer> {
    const stripe = this.stripe();
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: request.amountCents,
          currency: request.currency.toLowerCase(),
          destination: request.destinationAccountId,
          transfer_group: request.transferGroup,
        },
        // The payout id, so a re-run of the payout job is the same transfer.
        { idempotencyKey: `transfer-${request.idempotencyKey}` },
      );
      return { id: transfer.id };
    } catch (error) {
      this.unavailable('transfers.create', error);
    }
  }

  parseWebhookEvent(rawBody: string, signatureHeader: string | null): GatewayEvent {
    if (this.env.STRIPE_WEBHOOK_SECRET === undefined) throw missingKey('STRIPE_WEBHOOK_SECRET');
    if (signatureHeader === null) {
      throw new BadRequestError('The payment notification carried no signature.');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(
        rawBody,
        signatureHeader,
        this.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      // A body that does not verify is not evidence of anything, so this is a refusal
      // rather than an outage: answering 503 would invite Stripe to redeliver it forever.
      this.logger.warn({ err: error }, 'stripe webhook signature did not verify');
      throw new BadRequestError('The payment notification signature did not verify.');
    }
    return narrow(event);
  }
}

function refundStatus(status: string | null): Refund['status'] {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending';
}

/**
 * Narrow a verified Stripe event to the two this product acts on.
 *
 * Anything else — and any event of a known type whose payload is missing the fields the
 * product needs — becomes `unhandled` rather than a throw. The webhook endpoint must
 * acknowledge what it will not act on; a throw would make Stripe redeliver it forever.
 */
function narrow(event: Stripe.Event): GatewayEvent {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentIntentId = idOf(session.payment_intent);
    if (paymentIntentId === null || session.amount_total === null || session.currency === null) {
      return { id: event.id, type: 'unhandled', rawType: event.type };
    }
    return {
      id: event.id,
      type: 'checkout.session.completed',
      checkoutSessionId: session.id,
      paymentIntentId,
      amountTotalCents: session.amount_total,
      currency: session.currency.toUpperCase(),
    };
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentIntentId = idOf(charge.payment_intent);
    const refundId = charge.refunds?.data[0]?.id ?? null;
    if (paymentIntentId === null || refundId === null) {
      return { id: event.id, type: 'unhandled', rawType: event.type };
    }
    return {
      id: event.id,
      type: 'charge.refunded',
      paymentIntentId,
      refundId,
      amountRefundedCents: charge.amount_refunded,
    };
  }

  return { id: event.id, type: 'unhandled', rawType: event.type };
}

/** Stripe expands a reference to either an id or the whole object; take the id either way. */
function idOf(reference: string | { id: string } | null | undefined): string | null {
  if (typeof reference === 'string') return reference;
  return reference?.id ?? null;
}

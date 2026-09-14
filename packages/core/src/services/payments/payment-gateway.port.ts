/**
 * The payment seam (D04, R05). **Nothing outside `adapters/` may know Stripe exists.**
 *
 * The port fixes the shape; `container.ts` alone decides which adapter answers, exactly as
 * it does for the GitHub identity and mail seams. Services depend on this interface, so
 * every unit test and the integration harness run against `MockPaymentGateway` and never
 * contact a payment provider.
 */

export interface CheckoutSessionRequest {
  /** Carried back on the webhook so a confirmation can find its booking. */
  bookingId: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * When the hosted session stops accepting payment. Set from the booking's own hold so the
   * two cannot disagree about who owns the slot.
   */
  expiresAt: Date;
  description: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface RefundRequest {
  paymentIntentId: string;
  amountCents: number;
  /** The booking id, so a retried refund is the same refund rather than a second one. */
  idempotencyKey: string;
}

export interface Refund {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface TransferRequest {
  amountCents: number;
  currency: string;
  /** The mentor's Connect account. A payout with nowhere to go is held, never attempted. */
  destinationAccountId: string;
  /** The payout id, so a re-run of the payout job is the same transfer, not a second one. */
  idempotencyKey: string;
  /** Ties the transfer to the charge it came out of, for reconciliation. */
  transferGroup: string;
}

export interface Transfer {
  id: string;
}

/**
 * A verified provider event, already narrowed to what this product acts on.
 *
 * Everything else arrives as `unhandled` rather than being dropped: a webhook endpoint must
 * acknowledge an event type it does not care about, and silently discarding one makes the
 * difference between "we ignored it" and "we never received it" invisible.
 */
export type GatewayEvent =
  | {
      id: string;
      type: 'checkout.session.completed';
      checkoutSessionId: string;
      paymentIntentId: string;
      /** Compared against the booking's own price. A mismatch is refused (R08). */
      amountTotalCents: number;
      currency: string;
    }
  | {
      id: string;
      type: 'charge.refunded';
      paymentIntentId: string;
      refundId: string;
      amountRefundedCents: number;
    }
  | { id: string; type: 'unhandled'; rawType: string };

export interface PaymentGateway {
  createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession>;
  /**
   * Verify the raw request body against its signature header and narrow it to a
   * `GatewayEvent`.
   *
   * Synchronous and total: it either returns an event or throws. A bad signature is a
   * refusal, never an `unhandled` event — the whole point of the check is that an unsigned
   * body is not evidence of anything.
   */
  parseWebhookEvent(rawBody: string, signatureHeader: string | null): GatewayEvent;
  refund(request: RefundRequest): Promise<Refund>;
  /**
   * Send a mentor their share through Connect (E03-S06, R05).
   *
   * Rejects rather than reporting a failure state: unlike a refund, a transfer either was
   * accepted or was not, and the caller records `failed` and retries on the next run.
   */
  transfer(request: TransferRequest): Promise<Transfer>;
}

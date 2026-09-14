import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestError } from '../../../http/errors';
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

/** The secret the mock signs with. Not a credential: it protects nothing real. */
export const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';

export interface SimulatedDelivery {
  rawBody: string;
  signature: string;
}

/**
 * The payment gateway every unit test and the integration harness run against.
 *
 * It is a real implementation of the port, not a stub: it keeps its sessions, signs its
 * deliveries and refuses a bad signature. That matters because the two properties the money
 * gate actually cares about — a forged webhook is refused, and the same event delivered
 * twice confirms once — are only provable against something that can produce both a valid
 * delivery and an invalid one.
 *
 * **Ids are counter-derived, never random.** A failing money test must reproduce.
 *
 * **`createCheckoutSession` returns the caller's `successUrl`.** There is no hosted page to
 * send anyone to, and pretending otherwise would invite a local flow that "pays" by
 * navigating. Returning from checkout confirms nothing here for exactly the same reason it
 * confirms nothing in production: only a verified webhook moves a booking to `confirmed`.
 */
export class MockPaymentGateway implements PaymentGateway {
  private sequence = 0;
  private readonly sessions = new Map<string, CheckoutSessionRequest>();
  /** Every refund asked for, keyed by idempotency key, so a retry returns the first one. */
  private readonly refunds = new Map<string, Refund>();
  /** Every transfer asked for, on the same terms. */
  private readonly transfers = new Map<string, Transfer>();
  /** Every transfer this gateway was asked for, for a scenario that needs to assert one. */
  readonly transferRequests: TransferRequest[] = [];
  /** Set to fail the next call, so a test can exercise a provider outage. */
  private failure: Error | null = null;

  failNextCall(error: Error): void {
    this.failure = error;
  }

  private takeFailure(): void {
    const failure = this.failure;
    this.failure = null;
    if (failure !== null) throw failure;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_mock_${String(this.sequence).padStart(6, '0')}`;
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession> {
    this.takeFailure();
    const id = this.nextId('cs');
    this.sessions.set(id, request);
    return { id, url: request.successUrl };
  }

  /** What the caller asked for on this session, for a scenario that needs to assert it. */
  sessionRequest(checkoutSessionId: string): CheckoutSessionRequest | undefined {
    return this.sessions.get(checkoutSessionId);
  }

  async refund(request: RefundRequest): Promise<Refund> {
    this.takeFailure();
    const existing = this.refunds.get(request.idempotencyKey);
    if (existing !== undefined) return existing;
    const created: Refund = { id: this.nextId('re'), status: 'succeeded' };
    this.refunds.set(request.idempotencyKey, created);
    return created;
  }

  async transfer(request: TransferRequest): Promise<Transfer> {
    this.takeFailure();
    const existing = this.transfers.get(request.idempotencyKey);
    if (existing !== undefined) return existing;
    const created: Transfer = { id: this.nextId('tr') };
    this.transfers.set(request.idempotencyKey, created);
    this.transferRequests.push(request);
    return created;
  }

  parseWebhookEvent(rawBody: string, signatureHeader: string | null): GatewayEvent {
    if (signatureHeader === null || !verify(rawBody, signatureHeader)) {
      throw new BadRequestError('The payment notification signature did not verify.');
    }
    const parsed = JSON.parse(rawBody) as GatewayEvent;
    return parsed;
  }

  /**
   * Build the delivery a completed Checkout would produce, signed so
   * `parseWebhookEvent` accepts it. The caller decides the amount, which is how the
   * amount-mismatch refusal (R08) is exercised.
   */
  simulateCheckoutCompleted(
    checkoutSessionId: string,
    amountTotalCents: number,
    options: { eventId?: string; currency?: string } = {},
  ): SimulatedDelivery {
    return sign({
      id: options.eventId ?? this.nextId('evt'),
      type: 'checkout.session.completed',
      checkoutSessionId,
      paymentIntentId: `pi_mock_${checkoutSessionId}`,
      amountTotalCents,
      currency: options.currency ?? 'PLN',
    });
  }

  /** The delivery a settled refund would produce. */
  simulateRefunded(
    paymentIntentId: string,
    refundId: string,
    amountRefundedCents: number,
    options: { eventId?: string } = {},
  ): SimulatedDelivery {
    return sign({
      id: options.eventId ?? this.nextId('evt'),
      type: 'charge.refunded',
      paymentIntentId,
      refundId,
      amountRefundedCents,
    });
  }

  /** A delivery of a type this product does not act on. */
  simulateUnhandled(rawType: string, options: { eventId?: string } = {}): SimulatedDelivery {
    return sign({ id: options.eventId ?? this.nextId('evt'), type: 'unhandled', rawType });
  }
}

function signatureFor(rawBody: string): string {
  return createHmac('sha256', MOCK_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function sign(event: GatewayEvent): SimulatedDelivery {
  const rawBody = JSON.stringify(event);
  return { rawBody, signature: signatureFor(rawBody) };
}

function verify(rawBody: string, signatureHeader: string): boolean {
  const expected = Buffer.from(signatureFor(rawBody));
  const supplied = Buffer.from(signatureHeader);
  // Length-checked first: `timingSafeEqual` throws on a length mismatch rather than
  // answering false, and a wrong-length signature is simply wrong.
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

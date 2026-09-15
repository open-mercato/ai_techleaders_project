import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env';
import type { Logger } from '../../../logger';

/**
 * The SDK is stubbed rather than contacted: this adapter's job is translation — a request
 * shaped the way Stripe wants it, a verified event narrowed to what the product acts on,
 * and every failure turned into a typed `AppError` — and all three are provable without a
 * network. A real end-to-end Stripe pass is owed to manual QA and is named as such.
 */
const stripe = vi.hoisted(() => ({
  create: vi.fn(),
  refundsCreate: vi.fn(),
  transfersCreate: vi.fn(),
  constructEvent: vi.fn(),
  constructed: [] as unknown[],
}));

vi.mock('stripe', () => ({
  default: class {
    constructor(key: string) {
      stripe.constructed.push(key);
    }

    checkout = { sessions: { create: stripe.create } };
    refunds = { create: stripe.refundsCreate };
    transfers = { create: stripe.transfersCreate };
    webhooks = { constructEvent: stripe.constructEvent };
  },
}));

const { StripePaymentGateway, STRIPE_UNAVAILABLE_MESSAGE, MIN_CHECKOUT_EXPIRY_MS } = await import(
  './stripe-payment-gateway'
);

const logger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;

/** Well clear of Stripe's expiry floor, so an unclamped request passes through unchanged. */
const NOW = new Date('2026-09-14T11:50:00.000Z');

function gateway(overrides: Partial<AppEnv> = {}, now: Date = NOW) {
  return new StripePaymentGateway({
    env: {
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      ...overrides,
    } as AppEnv,
    logger,
    clock: { now: () => now },
  });
}

const request = {
  bookingId: 'booking-1',
  amountCents: 12_000,
  currency: 'PLN',
  successUrl: 'https://devmentor.test/sessions?booked=booking-1',
  cancelUrl: 'https://devmentor.test/m/ada',
  expiresAt: new Date('2026-09-14T12:30:00.000Z'),
  description: '25-minute text session with Mock Mentor',
};

beforeEach(() => {
  vi.clearAllMocks();
  stripe.constructed.length = 0;
  stripe.create.mockResolvedValue({ id: 'cs_live_1', url: 'https://checkout.stripe.test/cs_live_1' });
  stripe.refundsCreate.mockResolvedValue({ id: 're_live_1', status: 'succeeded' });
  stripe.transfersCreate.mockResolvedValue({ id: 'tr_live_1' });
});

describe('StripePaymentGateway checkout', () => {
  it('asks for a one-off payment at the booking price, expiring with the hold', async () => {
    const session = await gateway().createCheckoutSession(request);

    expect(session).toEqual({ id: 'cs_live_1', url: 'https://checkout.stripe.test/cs_live_1' });
    expect(stripe.create).toHaveBeenCalledExactlyOnceWith({
      mode: 'payment',
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      // The same instant as the booking's own hold, in Stripe's seconds.
      expires_at: 1_789_389_000,
      client_reference_id: 'booking-1',
      metadata: { bookingId: 'booking-1' },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'pln',
          unit_amount: 12_000,
          product_data: { name: request.description },
        },
      }],
    });
  });

  it('lifts an expiry inside Stripe floor up to it, rather than being refused', async () => {
    // The regression. The hold is 30 minutes and starts when the slot is *reserved*, which
    // is a whole round trip before checkout is *started*, so the deadline handed to Stripe
    // was always a little under its 30-minute minimum and it rejected every real session
    // with `invalid_request_error`. The mock gateway accepts any expiry, so nothing in the
    // suite could see it.
    const startedLate = new Date(request.expiresAt.getTime() - 29 * 60_000);

    await gateway({}, startedLate).createCheckoutSession(request);

    expect(stripe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: Math.floor((startedLate.getTime() + MIN_CHECKOUT_EXPIRY_MS) / 1000),
      }),
    );
  });

  it('leaves an expiry outside the floor exactly where the hold put it', async () => {
    // The two must agree about who owns the slot whenever Stripe allows it, so the clamp is
    // a floor and never a rewrite.
    const startedEarly = new Date(request.expiresAt.getTime() - 45 * 60_000);

    await gateway({}, startedEarly).createCheckoutSession(request);

    expect(stripe.create).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: 1_789_389_000 }),
    );
  });

  it('builds the client once and only when something needs it', async () => {
    const subject = gateway();
    expect(stripe.constructed).toEqual([]);

    await subject.createCheckoutSession(request);
    await subject.createCheckoutSession(request);

    expect(stripe.constructed).toEqual(['sk_test_x']);
  });

  it('answers a deployment with no secret key with a typed refusal, not a crash', async () => {
    await expect(
      gateway({ STRIPE_SECRET_KEY: undefined }).createCheckoutSession(request),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('turns a Stripe failure into a typed refusal and logs the operation, not the body', async () => {
    stripe.create.mockRejectedValue(new Error('card_declined'));

    await expect(gateway().createCheckoutSession(request)).rejects.toMatchObject({
      code: 'service_unavailable',
      message: STRIPE_UNAVAILABLE_MESSAGE,
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), operation: 'checkout.sessions.create' },
      'stripe request failed',
    );
  });

  it('treats a session with nowhere to send the payer as a failure, not a session', async () => {
    stripe.create.mockResolvedValue({ id: 'cs_live_1', url: null });

    await expect(gateway().createCheckoutSession(request)).rejects.toMatchObject({
      code: 'service_unavailable',
    });
  });
});

describe('StripePaymentGateway refunds', () => {
  it('keys the idempotency on the booking, so a retry is the same refund', async () => {
    const refund = await gateway().refund({
      paymentIntentId: 'pi_1',
      amountCents: 12_000,
      idempotencyKey: 'booking-1',
    });

    expect(refund).toEqual({ id: 're_live_1', status: 'succeeded' });
    expect(stripe.refundsCreate).toHaveBeenCalledExactlyOnceWith(
      { payment_intent: 'pi_1', amount: 12_000 },
      { idempotencyKey: 'refund-booking-1' },
    );
  });

  it.each([
    ['succeeded', 'succeeded'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
    ['pending', 'pending'],
    [null, 'pending'],
  ])('reports a %s refund as %s', async (given, expected) => {
    stripe.refundsCreate.mockResolvedValue({ id: 're_1', status: given });

    await expect(
      gateway().refund({ paymentIntentId: 'pi_1', amountCents: 1, idempotencyKey: 'b' }),
    ).resolves.toMatchObject({ status: expected });
  });

  it('turns a refund failure into a typed refusal', async () => {
    stripe.refundsCreate.mockRejectedValue(new Error('charge_already_refunded'));

    await expect(
      gateway().refund({ paymentIntentId: 'pi_1', amountCents: 1, idempotencyKey: 'b' }),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'refunds.create' }),
      'stripe request failed',
    );
  });
});

describe('StripePaymentGateway transfers', () => {
  const request = {
    amountCents: 7_200,
    currency: 'PLN',
    destinationAccountId: 'acct_1',
    idempotencyKey: 'payout-1',
    transferGroup: 'booking-1',
  };

  it('sends the share to the mentor account, keyed so a re-run is the same transfer', async () => {
    await expect(gateway().transfer(request)).resolves.toEqual({ id: 'tr_live_1' });

    expect(stripe.transfersCreate).toHaveBeenCalledExactlyOnceWith(
      {
        amount: 7_200,
        currency: 'pln',
        destination: 'acct_1',
        transfer_group: 'booking-1',
      },
      { idempotencyKey: 'transfer-payout-1' },
    );
  });

  it('turns a transfer failure into a typed refusal', async () => {
    stripe.transfersCreate.mockRejectedValue(new Error('insufficient_funds'));

    await expect(gateway().transfer(request)).rejects.toMatchObject({
      code: 'service_unavailable',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'transfers.create' }),
      'stripe request failed',
    );
  });

  it('refuses without a secret key rather than crashing', async () => {
    await expect(gateway({ STRIPE_SECRET_KEY: undefined }).transfer(request)).rejects
      .toMatchObject({ code: 'service_unavailable' });
    expect(stripe.transfersCreate).not.toHaveBeenCalled();
  });
});

describe('StripePaymentGateway webhook verification', () => {
  it('refuses a delivery this deployment cannot verify at all', () => {
    expect(() =>
      gateway({ STRIPE_WEBHOOK_SECRET: undefined }).parseWebhookEvent('{}', 'sig'),
    ).toThrow(/STRIPE_WEBHOOK_SECRET is not configured/);
  });

  it('refuses a delivery with no signature header', () => {
    expect(() => gateway().parseWebhookEvent('{}', null)).toThrowError(
      expect.objectContaining({ code: 'bad_request' }),
    );
    expect(() => gateway().parseWebhookEvent('{}', null)).toThrow(
      'The payment notification carried no signature.',
    );
    expect(stripe.constructEvent).not.toHaveBeenCalled();
  });

  it('refuses a body that does not verify, as a refusal rather than an outage', () => {
    stripe.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    // 400, not 503: answering 503 would invite Stripe to redeliver a forgery forever.
    expect(() => gateway().parseWebhookEvent('{}', 'bad')).toThrowError(
      expect.objectContaining({ code: 'bad_request' }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'stripe webhook signature did not verify',
    );
  });

  it('narrows a completed checkout, taking the payment intent by id or by object', () => {
    const session = (paymentIntent: unknown) => ({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_live_1',
          payment_intent: paymentIntent,
          amount_total: 12_000,
          currency: 'pln',
        },
      },
    });

    stripe.constructEvent.mockReturnValue(session('pi_live_1'));
    expect(gateway().parseWebhookEvent('{}', 'sig')).toEqual({
      id: 'evt_1',
      type: 'checkout.session.completed',
      checkoutSessionId: 'cs_live_1',
      paymentIntentId: 'pi_live_1',
      amountTotalCents: 12_000,
      currency: 'PLN',
    });

    stripe.constructEvent.mockReturnValue(session({ id: 'pi_live_2' }));
    expect(gateway().parseWebhookEvent('{}', 'sig')).toMatchObject({
      paymentIntentId: 'pi_live_2',
    });
  });

  it.each([
    ['no payment intent', { id: 'cs_1', payment_intent: null, amount_total: 1, currency: 'pln' }],
    ['no amount', { id: 'cs_1', payment_intent: 'pi_1', amount_total: null, currency: 'pln' }],
    ['no currency', { id: 'cs_1', payment_intent: 'pi_1', amount_total: 1, currency: null }],
  ])('acknowledges a completed checkout with %s rather than throwing', (_label, object) => {
    stripe.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object },
    });

    expect(gateway().parseWebhookEvent('{}', 'sig')).toEqual({
      id: 'evt_1',
      type: 'unhandled',
      rawType: 'checkout.session.completed',
    });
  });

  it('narrows a settled refund and reports the amount actually refunded', () => {
    stripe.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent: 'pi_live_1',
          amount_refunded: 12_000,
          refunds: { data: [{ id: 're_live_1' }] },
        },
      },
    });

    expect(gateway().parseWebhookEvent('{}', 'sig')).toEqual({
      id: 'evt_2',
      type: 'charge.refunded',
      paymentIntentId: 'pi_live_1',
      refundId: 're_live_1',
      amountRefundedCents: 12_000,
    });
  });

  it.each([
    ['no refund on it', { payment_intent: 'pi_1', amount_refunded: 1, refunds: { data: [] } }],
    ['no refunds list', { payment_intent: 'pi_1', amount_refunded: 1 }],
    ['no payment intent', { payment_intent: null, amount_refunded: 1, refunds: { data: [{ id: 're_1' }] } }],
  ])('acknowledges a refund event with %s rather than throwing', (_label, object) => {
    stripe.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'charge.refunded',
      data: { object },
    });

    expect(gateway().parseWebhookEvent('{}', 'sig')).toMatchObject({ type: 'unhandled' });
  });

  it('acknowledges an event type the product does not act on', () => {
    stripe.constructEvent.mockReturnValue({ id: 'evt_3', type: 'invoice.paid', data: { object: {} } });

    expect(gateway().parseWebhookEvent('{}', 'sig')).toEqual({
      id: 'evt_3',
      type: 'unhandled',
      rawType: 'invoice.paid',
    });
  });
});

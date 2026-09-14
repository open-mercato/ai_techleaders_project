import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../../http/errors';
import { MockPaymentGateway } from './mock-payment-gateway';

const request = {
  bookingId: 'booking-1',
  amountCents: 12_000,
  currency: 'PLN',
  successUrl: 'https://devmentor.test/sessions?booked=booking-1',
  cancelUrl: 'https://devmentor.test/m/ada',
  expiresAt: new Date('2026-09-14T12:30:00.000Z'),
  description: '25-minute text session with Mock Mentor',
};

describe('MockPaymentGateway checkout', () => {
  it('issues counter-derived ids so a failing money test reproduces', async () => {
    const gateway = new MockPaymentGateway();

    const first = await gateway.createCheckoutSession(request);
    const second = await gateway.createCheckoutSession(request);

    expect(first.id).toBe('cs_mock_000001');
    expect(second.id).toBe('cs_mock_000002');
  });

  it('sends the payer back to the caller url, because there is no page to host', async () => {
    const gateway = new MockPaymentGateway();

    const session = await gateway.createCheckoutSession(request);

    expect(session.url).toBe(request.successUrl);
    expect(gateway.sessionRequest(session.id)).toEqual(request);
    expect(gateway.sessionRequest('cs_unknown')).toBeUndefined();
  });

  it('fails one call on demand so a provider outage can be exercised', async () => {
    const gateway = new MockPaymentGateway();
    gateway.failNextCall(new Error('provider unreachable'));

    await expect(gateway.createCheckoutSession(request)).rejects.toThrow('provider unreachable');
    // Exactly one call, so a scenario can prove the retry succeeds.
    await expect(gateway.createCheckoutSession(request)).resolves.toMatchObject({
      id: 'cs_mock_000001',
    });
  });
});

describe('MockPaymentGateway refunds', () => {
  it('answers a retried refund with the first one rather than a second refund', async () => {
    const gateway = new MockPaymentGateway();

    const first = await gateway.refund({
      paymentIntentId: 'pi_1',
      amountCents: 12_000,
      idempotencyKey: 'booking-1',
    });
    const retry = await gateway.refund({
      paymentIntentId: 'pi_1',
      amountCents: 12_000,
      idempotencyKey: 'booking-1',
    });

    expect(first).toEqual({ id: 're_mock_000001', status: 'succeeded' });
    expect(retry).toEqual(first);
  });

  it('treats a different booking as a different refund', async () => {
    const gateway = new MockPaymentGateway();

    const one = await gateway.refund({ paymentIntentId: 'pi_1', amountCents: 1, idempotencyKey: 'a' });
    const two = await gateway.refund({ paymentIntentId: 'pi_2', amountCents: 1, idempotencyKey: 'b' });

    expect(one.id).not.toBe(two.id);
  });

  it('fails a refund on demand', async () => {
    const gateway = new MockPaymentGateway();
    gateway.failNextCall(new Error('refund declined'));

    await expect(
      gateway.refund({ paymentIntentId: 'pi_1', amountCents: 1, idempotencyKey: 'a' }),
    ).rejects.toThrow('refund declined');
  });
});

describe('MockPaymentGateway webhook verification', () => {
  it('accepts a delivery it signed and narrows it to a completed checkout', () => {
    const gateway = new MockPaymentGateway();
    const delivery = gateway.simulateCheckoutCompleted('cs_mock_000001', 12_000, {
      eventId: 'evt_1',
    });

    expect(gateway.parseWebhookEvent(delivery.rawBody, delivery.signature)).toEqual({
      id: 'evt_1',
      type: 'checkout.session.completed',
      checkoutSessionId: 'cs_mock_000001',
      paymentIntentId: 'pi_mock_cs_mock_000001',
      amountTotalCents: 12_000,
      currency: 'PLN',
    });
  });

  it('lets a caller choose the amount, which is how a mismatch is exercised', () => {
    const gateway = new MockPaymentGateway();
    const delivery = gateway.simulateCheckoutCompleted('cs_1', 1, { currency: 'EUR' });

    const event = gateway.parseWebhookEvent(delivery.rawBody, delivery.signature);

    expect(event).toMatchObject({ amountTotalCents: 1, currency: 'EUR' });
  });

  it('signs a settled refund and an event type the product does not act on', () => {
    const gateway = new MockPaymentGateway();
    const refunded = gateway.simulateRefunded('pi_1', 're_1', 12_000, { eventId: 'evt_r' });
    const other = gateway.simulateUnhandled('invoice.paid', { eventId: 'evt_o' });

    expect(gateway.parseWebhookEvent(refunded.rawBody, refunded.signature)).toEqual({
      id: 'evt_r',
      type: 'charge.refunded',
      paymentIntentId: 'pi_1',
      refundId: 're_1',
      amountRefundedCents: 12_000,
    });
    expect(gateway.parseWebhookEvent(other.rawBody, other.signature)).toEqual({
      id: 'evt_o',
      type: 'unhandled',
      rawType: 'invoice.paid',
    });
  });

  it('generates its own event id when a caller does not supply one', () => {
    const gateway = new MockPaymentGateway();

    const first = gateway.simulateCheckoutCompleted('cs_1', 1);
    const second = gateway.simulateRefunded('pi_1', 're_1', 1);
    const third = gateway.simulateUnhandled('invoice.paid');

    const ids = [first, second, third].map(
      (delivery) => (JSON.parse(delivery.rawBody) as { id: string }).id,
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toMatch(/^evt_mock_\d{6}$/);
  });

  it('refuses a body whose signature does not verify, and one with no signature at all', () => {
    const gateway = new MockPaymentGateway();
    const delivery = gateway.simulateCheckoutCompleted('cs_1', 12_000);

    expect(() => gateway.parseWebhookEvent(delivery.rawBody, null)).toThrow(BadRequestError);
    expect(() => gateway.parseWebhookEvent(delivery.rawBody, 'not-a-signature'))
      .toThrow(BadRequestError);
    // Right length, wrong bytes — the comparison must not short-circuit on length alone.
    const tampered = `${delivery.signature.slice(0, -1)}${delivery.signature.endsWith('0') ? '1' : '0'}`;
    expect(() => gateway.parseWebhookEvent(delivery.rawBody, tampered)).toThrow(BadRequestError);
  });

  it('refuses a body that was edited after it was signed', () => {
    const gateway = new MockPaymentGateway();
    const delivery = gateway.simulateCheckoutCompleted('cs_1', 12_000);
    const raised = delivery.rawBody.replace('12000', '1');

    expect(() => gateway.parseWebhookEvent(raised, delivery.signature)).toThrow(BadRequestError);
  });
});

describe('MockPaymentGateway transfers', () => {
  const transfer = {
    amountCents: 7_200,
    currency: 'PLN',
    destinationAccountId: 'acct_1',
    idempotencyKey: 'payout-1',
    transferGroup: 'booking-1',
  };

  it('answers a re-run with the first transfer rather than a second one', async () => {
    const gateway = new MockPaymentGateway();

    const first = await gateway.transfer(transfer);
    const rerun = await gateway.transfer(transfer);

    expect(first).toEqual({ id: 'tr_mock_000001' });
    expect(rerun).toEqual(first);
    // One transfer asked for, not two.
    expect(gateway.transferRequests).toEqual([transfer]);
  });

  it('treats a different payout as a different transfer', async () => {
    const gateway = new MockPaymentGateway();

    const one = await gateway.transfer(transfer);
    const two = await gateway.transfer({ ...transfer, idempotencyKey: 'payout-2' });

    expect(one.id).not.toBe(two.id);
    expect(gateway.transferRequests).toHaveLength(2);
  });

  it('rejects on demand, because a transfer either was accepted or was not', async () => {
    const gateway = new MockPaymentGateway();
    gateway.failNextCall(new Error('connect account restricted'));

    await expect(gateway.transfer(transfer)).rejects.toThrow('connect account restricted');
    expect(gateway.transferRequests).toEqual([]);
  });
});
